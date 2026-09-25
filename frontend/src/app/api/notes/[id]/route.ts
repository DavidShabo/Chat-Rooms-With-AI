import { deleteNote, updateNote } from "@/lib/queries";
import { badRequest, notFound, readJson, withUser } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LENGTH = 4000;

export const PATCH = withUser("notes:update", async (user, request, params) => {
  const body = await readJson<{ body?: string }>(request);
  if (!body) return badRequest("Body must be JSON.");

  const text = (body.body ?? "").trim();
  if (!text) return badRequest("Note can't be empty.");
  if (text.length > MAX_LENGTH) {
    return badRequest(`Note must be under ${MAX_LENGTH} characters.`);
  }

  const updated = await updateNote(user.id, params.id, text);
  if (!updated) return notFound("Note not found.");
  return Response.json({ ok: true });
});

export const DELETE = withUser("notes:delete", async (user, _request, params) => {
  const removed = await deleteNote(user.id, params.id);
  if (!removed) return notFound("Note not found.");
  return Response.json({ ok: true });
});
