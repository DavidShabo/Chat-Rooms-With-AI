-- Pixi — trusted devices (migration)
--
-- Every sign-in now requires an emailed code. Ticking "Remember this device"
-- stores a token here for 7 days; while it's valid that browser skips the
-- code step. After 7 days the code is required again.
--
-- Run after 01_schema.sql. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS trusted_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SECURITY: only the hash. The raw token lives in the browser cookie, so
  -- reading this table can't let anyone skip verification.
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  user_agent    text,
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trusted_devices_user_idx
  ON trusted_devices (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS trusted_devices_expiry_idx
  ON trusted_devices (expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
