import { deleteEvent } from "@/lib/queries";
import { notFound, withUser } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withUser("events:delete", async (user, _request, params) => {
  const removed = await deleteEvent(user.id, params.id);
  if (!removed) return notFound("Event not found.");
  return Response.json({ ok: true });
});
