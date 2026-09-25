import { query, queryOne } from "@/lib/db";

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type EventRow = {
  id: string;
  title: string;
  location: string | null;
  conference_url: string | null;
  is_all_day: boolean;
  start_label: string;
  end_label: string;
  attendee_count: number;
};

/**
 * Today's events, with the day boundary computed in the user's own timezone
 * rather than the server's — otherwise "today" silently shifts in deployment.
 */
export function getTodayEvents(userId: string) {
  return query<EventRow>(
    `
    WITH me AS (
      SELECT timezone FROM users WHERE id = $1
    ),
    bounds AS (
      SELECT
        ((now() AT TIME ZONE timezone)::date       AT TIME ZONE timezone) AS day_start,
        (((now() AT TIME ZONE timezone)::date + 1) AT TIME ZONE timezone) AS day_end,
        (now() AT TIME ZONE timezone)::date AS local_date,
        timezone
      FROM me
    )
    SELECT
      e.id,
      e.title,
      e.location,
      e.conference_url,
      e.is_all_day,
      coalesce(to_char(e.starts_at AT TIME ZONE b.timezone, 'FMHH12:MI AM'), 'All day') AS start_label,
      coalesce(to_char(e.ends_at   AT TIME ZONE b.timezone, 'FMHH12:MI AM'), '')        AS end_label,
      (SELECT count(*)::int FROM event_attendees a WHERE a.event_id = e.id) AS attendee_count
    FROM calendar_events e
    JOIN calendars c ON c.id = e.calendar_id
    CROSS JOIN bounds b
    WHERE e.user_id = $1
      AND e.deleted_at IS NULL
      AND e.status <> 'cancelled'
      AND c.is_selected
      AND (
        (NOT e.is_all_day AND e.starts_at < b.day_end AND e.ends_at > b.day_start)
        OR (e.is_all_day AND e.start_date <= b.local_date AND e.end_date >= b.local_date)
      )
    ORDER BY e.is_all_day DESC, e.starts_at
    `,
    [userId]
  );
}

export type MonthEvent = {
  id: string;
  title: string;
  location: string | null;
  is_all_day: boolean;
  local_date: string;
  start_label: string;
  end_label: string;
};

/**
 * Every event overlapping the given month, keyed by the local date it falls
 * on. `month` is 1-12.
 */
export function getMonthEvents(userId: string, year: number, month: number) {
  return query<MonthEvent>(
    `
    WITH me AS (SELECT timezone FROM users WHERE id = $1),
    span AS (
      SELECT
        make_date($2::int, $3::int, 1) AS first_day,
        (make_date($2::int, $3::int, 1) + interval '1 month')::date AS next_month,
        timezone
      FROM me
    )
    SELECT
      e.id,
      e.title,
      e.location,
      e.is_all_day,
      to_char(
        CASE WHEN e.is_all_day THEN e.start_date
             ELSE (e.starts_at AT TIME ZONE s.timezone)::date END,
        'YYYY-MM-DD'
      ) AS local_date,
      coalesce(to_char(e.starts_at AT TIME ZONE s.timezone, 'FMHH12:MI AM'), '') AS start_label,
      coalesce(to_char(e.ends_at   AT TIME ZONE s.timezone, 'FMHH12:MI AM'), '') AS end_label
    FROM calendar_events e
    JOIN calendars c ON c.id = e.calendar_id
    CROSS JOIN span s
    WHERE e.user_id = $1
      AND e.deleted_at IS NULL
      AND e.status <> 'cancelled'
      AND c.is_selected
      AND (
        (NOT e.is_all_day
           AND e.starts_at <  (s.next_month AT TIME ZONE s.timezone)
           AND e.ends_at   >= (s.first_day  AT TIME ZONE s.timezone))
        OR (e.is_all_day
           AND e.start_date < s.next_month
           AND e.end_date  >= s.first_day)
      )
    ORDER BY e.is_all_day DESC, e.starts_at, e.start_date
    `,
    [userId, year, month]
  );
}

/** The user's default calendar, created on demand. */
export async function getOrCreateCalendar(userId: string): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM calendars
      WHERE user_id = $1
      ORDER BY is_primary DESC, created_at
      LIMIT 1`,
    [userId]
  );
  if (existing) return existing.id;

  const created = await queryOne<{ id: string }>(
    `INSERT INTO calendars (user_id, name, time_zone, is_primary, color)
     SELECT $1, 'Pixi', u.timezone, true, '#7c5cff'
       FROM users u WHERE u.id = $1
     RETURNING id`,
    [userId]
  );
  if (!created) throw new Error("Could not create a calendar.");
  return created.id;
}

export async function createEvent(
  userId: string,
  input: {
    title: string;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    location?: string | null;
  }
) {
  const calendarId = await getOrCreateCalendar(userId);
  const allDay = !input.startTime;

  if (allDay) {
    return queryOne<{ id: string }>(
      `INSERT INTO calendar_events
         (user_id, calendar_id, title, location, is_all_day, start_date, end_date)
       VALUES ($1, $2, $3, $4, true, $5::date, $5::date)
       RETURNING id`,
      [userId, calendarId, input.title, input.location ?? null, input.date]
    );
  }

  // Times arrive as local wall-clock; convert using the user's zone so the
  // stored instant is correct.
  return queryOne<{ id: string }>(
    `
    INSERT INTO calendar_events
      (user_id, calendar_id, title, location, is_all_day,
       starts_at, ends_at, start_timezone, end_timezone)
    SELECT
      $1, $2, $3, $4, false,
      (($5::date + $6::time) AT TIME ZONE u.timezone),
      (($5::date + $7::time) AT TIME ZONE u.timezone),
      u.timezone, u.timezone
    FROM users u WHERE u.id = $1
    RETURNING id
    `,
    [
      userId,
      calendarId,
      input.title,
      input.location ?? null,
      input.date,
      input.startTime,
      input.endTime ?? input.startTime,
    ]
  );
}

export function deleteEvent(userId: string, eventId: string) {
  return queryOne<{ id: string }>(
    `DELETE FROM calendar_events WHERE id = $2 AND user_id = $1 RETURNING id`,
    [userId, eventId]
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskRow = {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  status: "open" | "done" | "archived";
  due_label: string | null;
};

export function getTasks(userId: string) {
  return query<TaskRow>(
    `
    WITH me AS (
      SELECT timezone FROM users WHERE id = $1
    ),
    ctx AS (
      SELECT timezone, (now() AT TIME ZONE timezone)::date AS today FROM me
    )
    SELECT
      t.id,
      t.title,
      t.priority,
      t.status,
      CASE
        WHEN t.due_at IS NOT NULL THEN
          CASE (t.due_at AT TIME ZONE ctx.timezone)::date - ctx.today
            WHEN 0 THEN 'Today, '    || to_char(t.due_at AT TIME ZONE ctx.timezone, 'FMHH12:MI AM')
            WHEN 1 THEN 'Tomorrow, ' || to_char(t.due_at AT TIME ZONE ctx.timezone, 'FMHH12:MI AM')
            WHEN -1 THEN 'Yesterday'
            ELSE to_char(t.due_at AT TIME ZONE ctx.timezone, 'FMDy, FMMon FMDD')
          END
        WHEN t.due_date IS NOT NULL THEN
          CASE t.due_date - ctx.today
            WHEN 0  THEN 'Today'
            WHEN 1  THEN 'Tomorrow'
            WHEN -1 THEN 'Yesterday'
            ELSE to_char(t.due_date, 'FMDy, FMMon FMDD')
          END
        ELSE NULL
      END AS due_label
    FROM tasks t
    CROSS JOIN ctx
    WHERE t.user_id = $1
      AND t.status <> 'archived'
    ORDER BY
      (t.status = 'done'),
      CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      coalesce(t.due_at, (t.due_date + time '23:59') AT TIME ZONE ctx.timezone) NULLS LAST
    `,
    [userId]
  );
}

export function createTask(
  userId: string,
  input: {
    title: string;
    priority?: "high" | "medium" | "low";
    dueDate?: string | null;
  }
) {
  return queryOne<{ id: string }>(
    // $4 is cast on both uses — Postgres can't infer a type for a bare
    // parameter in `$4 IS NOT NULL`.
    `INSERT INTO tasks (user_id, title, priority, source, is_all_day, due_date)
     VALUES ($1, $2, $3::task_priority, 'manual', ($4::date IS NOT NULL), $4::date)
     RETURNING id`,
    [userId, input.title, input.priority ?? "medium", input.dueDate ?? null]
  );
}

export function deleteTask(userId: string, taskId: string) {
  return queryOne<{ id: string }>(
    `DELETE FROM tasks WHERE id = $2 AND user_id = $1 RETURNING id`,
    [userId, taskId]
  );
}

export function setTaskDone(userId: string, taskId: string, done: boolean) {
  return queryOne<{ id: string }>(
    `
    UPDATE tasks
       SET status       = CASE WHEN $3 THEN 'done'::task_status ELSE 'open'::task_status END,
           completed_at = CASE WHEN $3 THEN now() ELSE NULL END
     WHERE id = $2 AND user_id = $1
     RETURNING id
    `,
    [userId, taskId, done]
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export type NoteRow = {
  id: string;
  body: string;
  created_label: string;
};

export function getNotes(userId: string) {
  return query<NoteRow>(
    `
    WITH me AS (SELECT timezone FROM users WHERE id = $1),
    ctx AS (SELECT timezone, (now() AT TIME ZONE timezone)::date AS today FROM me)
    SELECT
      n.id,
      n.body,
      CASE (n.created_at AT TIME ZONE ctx.timezone)::date - ctx.today
        WHEN 0  THEN 'Today'
        WHEN -1 THEN 'Yesterday'
        ELSE to_char(n.created_at AT TIME ZONE ctx.timezone, 'FMMon FMDD')
      END AS created_label
    FROM notes n
    CROSS JOIN ctx
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC
    `,
    [userId]
  );
}

export function createNote(userId: string, body: string) {
  return queryOne<{ id: string }>(
    `INSERT INTO notes (user_id, body) VALUES ($1, $2) RETURNING id`,
    [userId, body]
  );
}

export function updateNote(userId: string, noteId: string, body: string) {
  return queryOne<{ id: string }>(
    `UPDATE notes SET body = $3 WHERE id = $2 AND user_id = $1 RETURNING id`,
    [userId, noteId, body]
  );
}

export function deleteNote(userId: string, noteId: string) {
  return queryOne<{ id: string }>(
    `DELETE FROM notes WHERE id = $2 AND user_id = $1 RETURNING id`,
    [userId, noteId]
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_label: string;
};

/** Most recent thread, created on demand so a new user always has one. */
export async function getOrCreateThread(userId: string): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM chat_threads
      WHERE user_id = $1 AND archived_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId]
  );
  if (existing) return existing.id;

  const created = await queryOne<{ id: string }>(
    `INSERT INTO chat_threads (user_id, title) VALUES ($1, $2) RETURNING id`,
    [userId, "New conversation"]
  );
  if (!created) throw new Error("Could not create a chat thread.");
  return created.id;
}

export type ThreadRow = {
  id: string;
  title: string | null;
  updated_label: string;
  message_count: number;
};

export function getThreads(userId: string) {
  return query<ThreadRow>(
    `
    WITH me AS (SELECT timezone FROM users WHERE id = $1),
    ctx AS (SELECT timezone, (now() AT TIME ZONE timezone)::date AS today FROM me)
    SELECT
      t.id,
      t.title,
      CASE (t.updated_at AT TIME ZONE ctx.timezone)::date - ctx.today
        WHEN 0  THEN to_char(t.updated_at AT TIME ZONE ctx.timezone, 'FMHH12:MI AM')
        WHEN -1 THEN 'Yesterday'
        ELSE to_char(t.updated_at AT TIME ZONE ctx.timezone, 'FMMon FMDD')
      END AS updated_label,
      (SELECT count(*)::int FROM chat_messages m WHERE m.thread_id = t.id) AS message_count
    FROM chat_threads t
    CROSS JOIN ctx
    WHERE t.user_id = $1 AND t.archived_at IS NULL
    ORDER BY t.updated_at DESC
    LIMIT 50
    `,
    [userId]
  );
}

export function createThread(userId: string) {
  return queryOne<{ id: string }>(
    `INSERT INTO chat_threads (user_id, title) VALUES ($1, NULL) RETURNING id`,
    [userId]
  );
}

export function deleteThread(userId: string, threadId: string) {
  return queryOne<{ id: string }>(
    `DELETE FROM chat_threads WHERE id = $2 AND user_id = $1 RETURNING id`,
    [userId, threadId]
  );
}

export function renameThread(userId: string, threadId: string, title: string) {
  return queryOne<{ id: string }>(
    `UPDATE chat_threads SET title = $3 WHERE id = $2 AND user_id = $1 RETURNING id`,
    [userId, threadId, title]
  );
}

/**
 * Names an untitled thread after its first user message, so the sidebar
 * shows something meaningful without asking the user to name anything.
 */
export function autoTitleThread(userId: string, threadId: string, from: string) {
  const title = from.replace(/\s+/g, " ").trim().slice(0, 60);
  return query(
    `UPDATE chat_threads
        SET title = $3
      WHERE id = $2 AND user_id = $1 AND title IS NULL`,
    [userId, threadId, title]
  );
}

export function getMessages(userId: string, threadId: string) {
  return query<ChatRow>(
    `
    WITH me AS (SELECT timezone FROM users WHERE id = $1)
    SELECT
      m.id,
      m.role,
      m.content,
      to_char(m.created_at AT TIME ZONE me.timezone, 'FMHH12:MI AM') AS created_label
    FROM chat_messages m
    CROSS JOIN me
    JOIN chat_threads t ON t.id = m.thread_id
    WHERE m.thread_id = $2
      AND t.user_id = $1
      AND m.role <> 'system'
    ORDER BY m.created_at
    LIMIT 100
    `,
    [userId, threadId]
  );
}

export async function appendMessage(
  userId: string,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  model?: string
) {
  // The join guards against writing into someone else's thread.
  const row = await queryOne<{ id: string }>(
    `
    INSERT INTO chat_messages (thread_id, role, content, model)
    SELECT t.id, $3, $4, $5
      FROM chat_threads t
     WHERE t.id = $2 AND t.user_id = $1
    RETURNING id
    `,
    [userId, threadId, role, content, model ?? null]
  );

  if (row) {
    await query(`UPDATE chat_threads SET updated_at = now() WHERE id = $1`, [
      threadId,
    ]);
  }

  return row;
}
