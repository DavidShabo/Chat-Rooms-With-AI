-- Pixi — seed data
--
-- Creates one dev account plus sample calendar / task / note / chat rows.
-- Events are anchored to CURRENT_DATE, so today's agenda is always populated.
-- Re-running is safe (idempotent upserts).
--
-- Run 01_schema.sql first.
--
-- DEV LOGIN
--   email:    dev@pixi.local
--   password: pixi-dev-password-1
--
-- That password hash is a real scrypt digest and this account is already
-- marked verified, so you can sign in without a working mail provider.
-- Delete this user before anything is reachable from outside your machine.

BEGIN;

-- ---------------------------------------------------------------------------
-- Dev user. Change timezone to your own IANA zone — every "today" boundary
-- below is computed in it.
-- ---------------------------------------------------------------------------

INSERT INTO users (id, email, password_hash, email_verified_at, display_name, timezone)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'dev@pixi.local',
  'scrypt$39fdf98cbc39baa1cfb36df268e9461c$7480dc4627d071f4cfab0ec5ace4f725553f8e52891233c04dcca9c292cf69b066a0829acd2b5dd1a77adf4d1812577260a2246736d70ff02fb23b2d6be0f3ae',
  now(),
  'David Shabo',
  'America/New_York'
)
ON CONFLICT (id) DO UPDATE
  SET display_name      = EXCLUDED.display_name,
      timezone          = EXCLUDED.timezone,
      email_verified_at = EXCLUDED.email_verified_at;

-- ---------------------------------------------------------------------------
-- A local calendar (external_id stays NULL until Google/Microsoft is linked)
-- ---------------------------------------------------------------------------

INSERT INTO calendars (id, user_id, name, time_zone, is_primary, color)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Pixi',
  'America/New_York',
  true,
  '#7c5cff'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ---------------------------------------------------------------------------
-- Today's events
--
-- Wall-clock times are converted using the user's zone, so 9:00 AM means
-- 9:00 AM to them no matter what the server's timezone is.
-- ---------------------------------------------------------------------------

WITH tz AS (
  SELECT timezone AS zone
  FROM users
  WHERE id = '11111111-1111-1111-1111-111111111111'
),
today AS (
  SELECT (now() AT TIME ZONE zone)::date AS d, zone FROM tz
),
new_events AS (
  SELECT * FROM (VALUES
    ('33333333-0000-0000-0000-000000000001'::uuid, 'Standup',                         '09:00'::time, '09:15'::time, NULL::text,     NULL::text),
    ('33333333-0000-0000-0000-000000000002'::uuid, 'Integration architecture review', '11:00'::time, '12:00'::time, 'Conf room B',  NULL),
    ('33333333-0000-0000-0000-000000000003'::uuid, 'Lunch with Marcus',               '12:30'::time, '13:30'::time, 'Nomad Cafe',   NULL),
    ('33333333-0000-0000-0000-000000000004'::uuid, 'Vendor call — design system',     '15:00'::time, '15:45'::time, NULL,           'https://meet.google.com/abc-defg-hij'),
    ('33333333-0000-0000-0000-000000000005'::uuid, 'Focus block — spec review',       '16:00'::time, '17:30'::time, NULL,           NULL)
  ) AS t(id, title, start_t, end_t, location, conference_url)
)
INSERT INTO calendar_events (
  id, user_id, calendar_id, title, location, conference_url,
  is_all_day, starts_at, ends_at, start_timezone, end_timezone, status
)
SELECT
  e.id,
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  e.title,
  e.location,
  e.conference_url,
  false,
  ((today.d + e.start_t) AT TIME ZONE today.zone),
  ((today.d + e.end_t)   AT TIME ZONE today.zone),
  today.zone,
  today.zone,
  'confirmed'
FROM new_events e CROSS JOIN today
ON CONFLICT (id) DO UPDATE
  SET starts_at = EXCLUDED.starts_at,
      ends_at   = EXCLUDED.ends_at,
      title     = EXCLUDED.title,
      location  = EXCLUDED.location;

-- Attendees
INSERT INTO event_attendees (event_id, email, display_name, response, is_organizer)
VALUES
  ('33333333-0000-0000-0000-000000000002', 'marcus.webb@example.com', 'Marcus Webb', 'accepted',     false),
  ('33333333-0000-0000-0000-000000000002', 'dana.ruiz@example.com',   'Dana Ruiz',   'accepted',     false),
  ('33333333-0000-0000-0000-000000000002', 'dev@pixi.local',          'David Shabo', 'accepted',     true),
  ('33333333-0000-0000-0000-000000000002', 'sam.okafor@example.com',  'Sam Okafor',  'needs_action', false),
  ('33333333-0000-0000-0000-000000000004', 'vendor@example.com',      'Design Co',   'accepted',     false),
  ('33333333-0000-0000-0000-000000000004', 'dev@pixi.local',          'David Shabo', 'accepted',     true)
ON CONFLICT (event_id, email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

WITH tz AS (
  SELECT timezone AS zone FROM users WHERE id = '11111111-1111-1111-1111-111111111111'
),
today AS (SELECT (now() AT TIME ZONE zone)::date AS d, zone FROM tz)
INSERT INTO tasks (
  id, user_id, title, priority, status, source, is_all_day, due_at, due_date, completed_at
)
SELECT
  v.id, '11111111-1111-1111-1111-111111111111'::uuid, v.title,
  v.priority, v.status, v.source, v.is_all_day,
  CASE WHEN v.due_time IS NULL THEN NULL
       ELSE ((today.d + v.due_time) AT TIME ZONE today.zone) END,
  CASE WHEN v.day_offset IS NULL THEN NULL
       ELSE today.d + v.day_offset END,
  CASE WHEN v.status = 'done' THEN now() ELSE NULL END
FROM today, (VALUES
  ('44444444-0000-0000-0000-000000000001'::uuid, 'Review the Q3 integration spec',      'high'::task_priority,   'open'::task_status, 'pixi'::item_source,   false, '16:00'::time, NULL::integer),
  ('44444444-0000-0000-0000-000000000002'::uuid, 'Send follow-up to the design vendor', 'high',                  'open',              'pixi',                false, '18:30'::time, NULL),
  ('44444444-0000-0000-0000-000000000003'::uuid, 'Book flights for the Denver trip',    'medium',                'open',              'manual',              true,  NULL,          1),
  ('44444444-0000-0000-0000-000000000004'::uuid, 'Renew the domain registration',       'medium',                'open',              'pixi',                true,  NULL,          7),
  ('44444444-0000-0000-0000-000000000005'::uuid, 'Draft the onboarding checklist',      'low',                   'open',              'manual',              true,  NULL,          10),
  ('44444444-0000-0000-0000-000000000006'::uuid, 'Export last month''s invoices',       'low',                   'done',              'pixi',                true,  NULL,          -1)
) AS v(id, title, priority, status, source, is_all_day, due_time, day_offset)
ON CONFLICT (id) DO UPDATE
  SET title        = EXCLUDED.title,
      status       = EXCLUDED.status,
      due_at       = EXCLUDED.due_at,
      due_date     = EXCLUDED.due_date,
      completed_at = EXCLUDED.completed_at;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------

INSERT INTO notes (id, user_id, body, created_at)
VALUES
  ('55555555-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Backend should expose SSE for streaming — IAsyncEnumerable maps cleanly.', now()),
  ('55555555-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Ask Dana about the extra night in Denver before booking flights.', now() - interval '1 day'),
  ('55555555-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Local file agent: scope to a whitelist of directories, never full disk.', now() - interval '6 days')
ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------

INSERT INTO chat_threads (id, user_id, title)
VALUES ('66666666-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'Morning check-in')
ON CONFLICT (id) DO NOTHING;

INSERT INTO chat_messages (id, thread_id, role, content, model)
VALUES (
  '77777777-0000-0000-0000-000000000001',
  '66666666-0000-0000-0000-000000000001',
  'assistant',
  'Morning. You''ve got 5 things on the calendar today and two tasks due before end of day. The integration spec review at 4 is the one worth protecting — want me to block prep time before it?',
  'gemini-3.5-flash'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
