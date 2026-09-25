import { deleteThread, renameThread } from "@/lib/queries";
import { badRequest, notFound, readJson, withUser } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withUser("threads:delete", async (user, _request, params) => {
  // Messages go with it via ON DELETE CASCADE.
  const removed = await deleteThread(user.id, params.id);
  if (!removed) return notFound("Conversation not found.");
  return Response.json({ ok: true });
});

export const PATCH = withUser("threads:rename", async (user, request, params) => {
  const body = await readJson<{ title?: string }>(request);
  if (!body) return badRequest("Body must be JSON.");

  const title = (body.title ?? "").trim();
  if (!title) return badRequest("Title can't be empty.");
  if (title.length > 120) return badRequest("Title must be under 120 characters.");

  const updated = await renameThread(user.id, params.id, title);
  if (!updated) return notFound("Conversation not found.");
  return Response.json({ ok: true });
});
