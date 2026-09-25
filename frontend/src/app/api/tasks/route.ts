import { createTask } from "@/lib/queries";
import { badRequest, readJson, withUser } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  priority?: string;
  dueDate?: string | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = ["high", "medium", "low"] as const;

export const POST = withUser("tasks:create", async (user, request) => {
  const body = await readJson<Body>(request);
  if (!body) return badRequest("Body must be JSON.");

  const title = (body.title ?? "").trim();
  if (!title) return badRequest("Give the task a title.");
  if (title.length > 300) return badRequest("Title must be under 300 characters.");

  const priority = PRIORITIES.includes(body.priority as never)
    ? (body.priority as (typeof PRIORITIES)[number])
    : "medium";

  const dueDate = body.dueDate?.trim() || null;
  if (dueDate && !DATE.test(dueDate)) {
    return badRequest("Due date must be YYYY-MM-DD.");
  }

  const task = await createTask(user.id, { title, priority, dueDate });
  return Response.json({ ok: true, id: task?.id }, { status: 201 });
});
