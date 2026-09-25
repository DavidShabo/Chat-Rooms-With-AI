-- Pixi — the queries each panel runs.
-- Reference for the backend; not meant to be executed as one script.

-- ---------------------------------------------------------------------------
-- Calendar panel: today's events, in the user's own timezone.
--
-- The day boundary is computed in the user's zone rather than the server's,
-- which is the part that silently breaks if you use CURRENT_DATE directly.
-- ---------------------------------------------------------------------------

WITH me AS (
  SELECT id, timezone FROM users WHERE id = $1
),
bounds AS (
  SELECT
    ((now() AT TIME ZONE timezone)::date       AT TIME ZONE timezone) AS day_start,
    (((now() AT TIME ZONE timezone)::date + 1) AT TIME ZONE timezone) AS day_end,
    timezone
  FROM me
)
SELECT
  e.id,
  e.title,
  e.location,
  e.conference_url,
  e.is_all_day,
  e.starts_at,
  e.ends_at,
  to_char(e.starts_at AT TIME ZONE b.timezone, 'FMHH12:MI AM') AS start_label,
  to_char(e.ends_at   AT TIME ZONE b.timezone, 'FMHH12:MI AM') AS end_label,
  c.name  AS calendar_name,
  c.color AS calendar_color,
  (SELECT count(*) FROM event_attendees a WHERE a.event_id = e.id) AS attendee_count
FROM calendar_events e
JOIN calendars c ON c.id = e.calendar_id
CROSS JOIN bounds b
WHERE e.user_id = $1
  AND e.deleted_at IS NULL
  AND e.status <> 'cancelled'
  AND c.is_selected
  AND (
    (NOT e.is_all_day AND e.starts_at < b.day_end AND e.ends_at > b.day_start)
    OR (e.is_all_day AND e.start_date <= (b.day_start AT TIME ZONE b.timezone)::date
                     AND e.end_date   >= (b.day_start AT TIME ZONE b.timezone)::date)
  )
ORDER BY e.is_all_day DESC, e.starts_at;

-- ---------------------------------------------------------------------------
-- Agenda for an arbitrary window (used by "find me a free hour")
-- $2 = window start, $3 = window end
-- ---------------------------------------------------------------------------

SELECT e.id, e.title, e.starts_at, e.ends_at
FROM calendar_events e
JOIN calendars c ON c.id = e.calendar_id
WHERE e.user_id = $1
  AND e.deleted_at IS NULL
  AND e.status <> 'cancelled'
  AND c.is_selected
  AND NOT e.is_all_day
  AND e.starts_at < $3
  AND e.ends_at   > $2
ORDER BY e.starts_at;

-- ---------------------------------------------------------------------------
-- Gaps between events — the actual "free hour" answer.
-- Returns each opening of at least 60 minutes inside the window.
-- ---------------------------------------------------------------------------

WITH busy AS (
  SELECT e.starts_at, e.ends_at
  FROM calendar_events e
  JOIN calendars c ON c.id = e.calendar_id
  WHERE e.user_id = $1
    AND e.deleted_at IS NULL
    AND e.status <> 'cancelled'
    AND c.is_selected
    AND NOT e.is_all_day
    AND e.starts_at < $3
    AND e.ends_at   > $2
),
edges AS (
  SELECT ends_at AS gap_start,
         lead(starts_at) OVER (ORDER BY starts_at) AS gap_end
  FROM busy
  UNION ALL
  SELECT $2, (SELECT min(starts_at) FROM busy)
)
SELECT gap_start, gap_end, gap_end - gap_start AS duration
FROM edges
WHERE gap_end IS NOT NULL
  AND gap_end - gap_start >= interval '60 minutes'
ORDER BY gap_start;

-- ---------------------------------------------------------------------------
-- Tasks panel
-- ---------------------------------------------------------------------------

SELECT
  t.id, t.title, t.priority, t.status, t.source,
  t.is_all_day, t.due_at, t.due_date, t.completed_at
FROM tasks t
WHERE t.user_id = $1
  AND t.status <> 'archived'
ORDER BY
  (t.status = 'done'),
  CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
  coalesce(t.due_at, (t.due_date + time '23:59') AT TIME ZONE 'UTC') NULLS LAST;

-- ---------------------------------------------------------------------------
-- Inbox panel
-- ---------------------------------------------------------------------------

SELECT
  m.id, m.from_name, m.from_email, m.subject, m.snippet,
  m.received_at, m.is_unread, a.provider
FROM email_messages m
JOIN connected_accounts a ON a.id = m.connected_account_id
WHERE m.user_id = $1
ORDER BY m.received_at DESC
LIMIT 25;

-- ---------------------------------------------------------------------------
-- Chat history for a thread
-- ---------------------------------------------------------------------------

SELECT role, content, created_at
FROM chat_messages
WHERE thread_id = $1
ORDER BY created_at
LIMIT 40;

-- ---------------------------------------------------------------------------
-- Sync upsert — what the Google/Microsoft poller writes per event.
-- The unique index on (calendar_id, external_id) makes this idempotent, so
-- replaying a sync page never duplicates rows.
-- ---------------------------------------------------------------------------

INSERT INTO calendar_events (
  user_id, calendar_id, external_id, etag, ical_uid,
  title, description, location, html_link, conference_url,
  is_all_day, starts_at, ends_at, start_date, end_date,
  start_timezone, end_timezone, status,
  organizer_name, organizer_email,
  recurrence, recurring_event_external_id, original_starts_at,
  deleted_at
)
VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15,
  $16, $17, $18,
  $19, $20,
  $21, $22, $23,
  $24
)
ON CONFLICT (calendar_id, external_id) WHERE external_id IS NOT NULL
DO UPDATE SET
  etag                        = EXCLUDED.etag,
  title                       = EXCLUDED.title,
  description                 = EXCLUDED.description,
  location                    = EXCLUDED.location,
  html_link                   = EXCLUDED.html_link,
  conference_url              = EXCLUDED.conference_url,
  is_all_day                  = EXCLUDED.is_all_day,
  starts_at                   = EXCLUDED.starts_at,
  ends_at                     = EXCLUDED.ends_at,
  start_date                  = EXCLUDED.start_date,
  end_date                    = EXCLUDED.end_date,
  start_timezone              = EXCLUDED.start_timezone,
  end_timezone                = EXCLUDED.end_timezone,
  status                      = EXCLUDED.status,
  organizer_name              = EXCLUDED.organizer_name,
  organizer_email             = EXCLUDED.organizer_email,
  recurrence                  = EXCLUDED.recurrence,
  recurring_event_external_id = EXCLUDED.recurring_event_external_id,
  original_starts_at          = EXCLUDED.original_starts_at,
  deleted_at                  = EXCLUDED.deleted_at
WHERE calendar_events.etag IS DISTINCT FROM EXCLUDED.etag;

-- After a sync page, store the cursor so the next run is incremental:
-- UPDATE calendars SET sync_token = $2, last_synced_at = now() WHERE id = $1;
