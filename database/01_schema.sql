-- Pixi — schema
-- PostgreSQL 13+ (gen_random_uuid() is built in from 13; on 12 or older run
-- CREATE EXTENSION IF NOT EXISTS pgcrypto; first).
--
-- Paste this whole file into pgAdmin's Query Tool and execute.
-- Safe to re-run: every object is created IF NOT EXISTS.
--
-- Covers: auth, calendar, tasks, notes, chat.
-- The Gmail/Outlook message cache is deliberately left out until you add
-- that integration; connected_accounts stays because calendar OAuth needs it.

BEGIN;

-- ===========================================================================
-- Enums
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE account_provider AS ENUM ('google', 'microsoft', 'apple');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM ('idle', 'syncing', 'error', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('confirmed', 'tentative', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendee_response AS ENUM ('needs_action', 'accepted', 'declined', 'tentative');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('open', 'done', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE item_source AS ENUM ('pixi', 'manual', 'google', 'microsoft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_purpose AS ENUM ('email_verify', 'password_reset', 'login_mfa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===========================================================================
-- updated_at trigger
-- ===========================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- AUTH
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- users
--
-- SECURITY: password_hash holds a scrypt/argon2/bcrypt digest, never the
-- password itself. email_verified_at stays NULL until the emailed code is
-- confirmed — gate login on it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL,
  password_hash      text NOT NULL,
  email_verified_at  timestamptz,
  display_name       text,
  -- IANA name, e.g. 'America/New_York'. Every "today" query depends on this.
  timezone           text NOT NULL DEFAULT 'UTC',
  last_login_at      timestamptz,
  -- Brute-force guards on the login form.
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_shape CHECK (position('@' in email) > 1)
);

-- Case-insensitive uniqueness: Dave@x.com and dave@x.com are one account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON users (lower(email));

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- verification_codes — the 6-digit codes mailed out
--
-- SECURITY: store a hash of the code, not the code. A leaked database
-- otherwise hands over working codes for every pending signup.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS verification_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash     text NOT NULL,
  purpose       verification_purpose NOT NULL DEFAULT 'email_verify',
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Look up the newest live code for a user without scanning history.
CREATE INDEX IF NOT EXISTS verification_codes_lookup_idx
  ON verification_codes (user_id, purpose, created_at DESC)
  WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- sessions — one row per signed-in browser
--
-- SECURITY: token_hash only. The raw token lives in the user's httpOnly
-- cookie and nowhere else, so a database read cannot impersonate anyone.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  user_agent    text,
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx
  ON sessions (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_expiry_idx
  ON sessions (expires_at)
  WHERE revoked_at IS NULL;

-- ===========================================================================
-- CALENDAR
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- connected_accounts — OAuth grants. This is what makes calendar calls
-- possible at all.
--
-- SECURITY: encrypt access_token / refresh_token before writing them
-- (ASP.NET Data Protection, or pgcrypto). Never plaintext.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS connected_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider             account_provider NOT NULL,
  -- Stable id from the provider (Google 'sub', Microsoft 'oid').
  provider_account_id  text NOT NULL,
  email                text NOT NULL,
  access_token         text,
  refresh_token        text,
  token_expires_at     timestamptz,
  scopes               text[] NOT NULL DEFAULT '{}',
  status               sync_status NOT NULL DEFAULT 'idle',
  last_error           text,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connected_accounts_unique_per_user
    UNIQUE (user_id, provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS connected_accounts_user_idx
  ON connected_accounts (user_id);

DROP TRIGGER IF EXISTS connected_accounts_set_updated_at ON connected_accounts;
CREATE TRIGGER connected_accounts_set_updated_at BEFORE UPDATE ON connected_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- calendars — one account can expose many calendars
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendars (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_account_id  uuid REFERENCES connected_accounts(id) ON DELETE CASCADE,
  -- Provider's calendarId. NULL for a calendar created locally in Pixi.
  external_id           text,
  name                  text NOT NULL,
  description           text,
  time_zone             text NOT NULL DEFAULT 'UTC',
  color                 text,
  is_primary            boolean NOT NULL DEFAULT false,
  -- Whether Pixi shows this calendar in the UI.
  is_selected           boolean NOT NULL DEFAULT true,
  access_role           text,
  -- Opaque incremental-sync cursor from the provider. Send it on the next
  -- sync to receive only what changed.
  sync_token            text,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendars_account_external_key
  ON calendars (connected_account_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendars_user_idx ON calendars (user_id);

DROP TRIGGER IF EXISTS calendars_set_updated_at ON calendars;
CREATE TRIGGER calendars_set_updated_at BEFORE UPDATE ON calendars
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- calendar_events
--
-- Timed events use starts_at/ends_at (timestamptz, stored as UTC).
-- All-day events use start_date/end_date, because an all-day event is a
-- calendar date, not an instant — forcing it into a timestamp shifts the day
-- for anyone in another timezone.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendar_events (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id                  uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,

  external_id                  text,
  -- Provider version marker; skip the write when it hasn't changed.
  etag                         text,
  ical_uid                     text,

  title                        text NOT NULL DEFAULT '(no title)',
  description                  text,
  location                     text,
  html_link                    text,
  conference_url               text,

  is_all_day                   boolean NOT NULL DEFAULT false,
  starts_at                    timestamptz,
  ends_at                      timestamptz,
  start_date                   date,
  end_date                     date,
  -- Original IANA zone, needed to expand recurrences correctly across DST.
  start_timezone               text,
  end_timezone                 text,

  status                       event_status NOT NULL DEFAULT 'confirmed',
  organizer_name               text,
  organizer_email              text,

  -- RRULE / EXDATE / RDATE lines exactly as the provider returns them.
  recurrence                   text[],
  -- Set on a single instance of a recurring series.
  recurring_event_external_id  text,
  original_starts_at           timestamptz,

  -- Soft delete: providers report deletions, and we need to tell
  -- "cancelled upstream" apart from "never synced".
  deleted_at                   timestamptz,

  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT calendar_events_time_present CHECK (
    (is_all_day AND start_date IS NOT NULL AND end_date IS NOT NULL)
    OR (NOT is_all_day AND starts_at IS NOT NULL AND ends_at IS NOT NULL)
  ),
  CONSTRAINT calendar_events_time_ordered CHECK (
    (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at)
    AND (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
  )
);

-- Makes upsert-on-sync idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_calendar_external_key
  ON calendar_events (calendar_id, external_id)
  WHERE external_id IS NOT NULL;

-- The "what's on today" query.
CREATE INDEX IF NOT EXISTS calendar_events_user_starts_idx
  ON calendar_events (user_id, starts_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS calendar_events_user_dates_idx
  ON calendar_events (user_id, start_date)
  WHERE deleted_at IS NULL AND is_all_day;

CREATE INDEX IF NOT EXISTS calendar_events_series_idx
  ON calendar_events (recurring_event_external_id)
  WHERE recurring_event_external_id IS NOT NULL;

DROP TRIGGER IF EXISTS calendar_events_set_updated_at ON calendar_events;
CREATE TRIGGER calendar_events_set_updated_at BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- event_attendees
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS event_attendees (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  email         text NOT NULL,
  display_name  text,
  response      attendee_response NOT NULL DEFAULT 'needs_action',
  is_organizer  boolean NOT NULL DEFAULT false,
  is_optional   boolean NOT NULL DEFAULT false,
  is_self       boolean NOT NULL DEFAULT false,
  CONSTRAINT event_attendees_unique UNIQUE (event_id, email)
);

CREATE INDEX IF NOT EXISTS event_attendees_event_idx
  ON event_attendees (event_id);

-- ===========================================================================
-- TASKS
-- ===========================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_account_id  uuid REFERENCES connected_accounts(id) ON DELETE SET NULL,
  external_id           text,

  title                 text NOT NULL,
  notes                 text,
  priority              task_priority NOT NULL DEFAULT 'medium',
  status                task_status NOT NULL DEFAULT 'open',
  source                item_source NOT NULL DEFAULT 'manual',

  is_all_day            boolean NOT NULL DEFAULT false,
  due_at                timestamptz,
  due_date              date,
  completed_at          timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tasks_completed_consistent CHECK (
    (status = 'done' AND completed_at IS NOT NULL)
    OR (status <> 'done' AND completed_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_account_external_key
  ON tasks (connected_account_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_user_due_idx
  ON tasks (user_id, status, due_at);

DROP TRIGGER IF EXISTS tasks_set_updated_at ON tasks;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- NOTES
-- ===========================================================================

CREATE TABLE IF NOT EXISTS notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        text NOT NULL,
  pinned      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_user_created_idx
  ON notes (user_id, created_at DESC);

DROP TRIGGER IF EXISTS notes_set_updated_at ON notes;
CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- CHAT
-- ===========================================================================

CREATE TABLE IF NOT EXISTS chat_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_threads_user_idx
  ON chat_threads (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS chat_threads_set_updated_at ON chat_threads;
CREATE TRIGGER chat_threads_set_updated_at BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS chat_messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id          uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role               chat_role NOT NULL,
  content            text NOT NULL,
  model              text,
  prompt_tokens      integer,
  completion_tokens  integer,
  -- Set when a reply failed, so the UI can show what went wrong.
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_thread_idx
  ON chat_messages (thread_id, created_at);

COMMIT;
