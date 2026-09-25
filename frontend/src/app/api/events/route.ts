import { createEvent } from "@/lib/queries";
import { badRequest, readJson, withUser } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export const POST = withUser("events:create", async (user, request) => {
  const body = await readJson<Body>(request);
  if (!body) return badRequest("Body must be JSON.");

  const title = (body.title ?? "").trim();
  if (!title) return badRequest("Give the event a title.");
  if (title.length > 200) return badRequest("Title must be under 200 characters.");

  const date = (body.date ?? "").trim();
  if (!DATE.test(date)) return badRequest("Date must be YYYY-MM-DD.");

  const startTime = body.startTime?.trim() || null;
  const endTime = body.endTime?.trim() || null;

  if (startTime && !TIME.test(startTime)) {
    return badRequest("Start time must be HH:MM.");
  }
  if (endTime && !TIME.test(endTime)) {
    return badRequest("End time must be HH:MM.");
  }
  if (startTime && endTime && endTime < startTime) {
    return badRequest("End time can't be before the start time.");
  }

  const event = await createEvent(user.id, {
    title,
    date,
    startTime,
    endTime,
    location: body.location?.trim() || null,
  });

  return Response.json({ ok: true, id: event?.id }, { status: 201 });
});
