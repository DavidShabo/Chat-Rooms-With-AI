import { getSessionUser } from "@/lib/auth";
import { describeDbError } from "@/lib/db";
import { createNote } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LENGTH = 4000;

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }

    let body: { body?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const text = (body.body ?? "").trim();
    if (!text) {
      return Response.json({ error: "Note can't be empty." }, { status: 400 });
    }
    if (text.length > MAX_LENGTH) {
      return Response.json(
        { error: `Note must be under ${MAX_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const note = await createNote(user.id, text);
    return Response.json({ ok: true, id: note?.id }, { status: 201 });
  } catch (error) {
    console.error("[notes]", error);
    const dbProblem = describeDbError(error);
    return Response.json(
      { error: dbProblem ?? "Something went wrong." },
      { status: dbProblem ? 503 : 500 }
    );
  }
}
