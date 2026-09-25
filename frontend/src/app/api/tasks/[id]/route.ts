import { deleteTask, setTaskDone } from "@/lib/queries";
import { badRequest, notFound, readJson, withUser } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withUser("tasks:update", async (user, request, params) => {
  const body = await readJson<{ done?: boolean }>(request);
  if (!body) return badRequest("Body must be JSON.");
  if (typeof body.done !== "boolean") {
    return badRequest("`done` must be a boolean.");
  }

  // Scoped to the signed-in user, so one account can't flip another's tasks.
  const updated = await setTaskDone(user.id, params.id, body.done);
  if (!updated) return notFound("Task not found.");
  return Response.json({ ok: true });
});

export const DELETE = withUser("tasks:delete", async (user, _request, params) => {
  const removed = await deleteTask(user.id, params.id);
  if (!removed) return notFound("Task not found.");
  return Response.json({ ok: true });
});
