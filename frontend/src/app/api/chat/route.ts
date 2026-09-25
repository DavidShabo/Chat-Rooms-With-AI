import { getSessionUser } from "@/lib/auth";
import { describeDbError } from "@/lib/db";
import { streamChat, type Turn } from "@/lib/gemini";
import { isSelectableModel } from "@/lib/models";
import {
  appendMessage,
  autoTitleThread,
  getMessages,
  getOrCreateThread,
} from "@/lib/queries";

export const runtime = "nodejs";
// Streaming responses must not be cached or statically rendered.
export const dynamic = "force-dynamic";

const MAX_LENGTH = 8000;
const HISTORY_TURNS = 20;

export async function POST(request: Request) {
  let user;
  try {
    user = await getSessionUser();
  } catch (error) {
    const dbProblem = describeDbError(error);
    return Response.json(
      { error: dbProblem ?? "Something went wrong." },
      { status: dbProblem ? 503 : 500 }
    );
  }

  if (!user) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { message?: string; threadId?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // Only models on the allowlist — the body shouldn't be able to name an
  // arbitrary endpoint.
  const chosenModel = isSelectableModel(body.model) ? body.model : undefined;

  const message = (body.message ?? "").trim();

  if (!message) {
    return Response.json({ error: "Message can't be empty." }, { status: 400 });
  }
  if (message.length > MAX_LENGTH) {
    return Response.json(
      { error: `Message must be under ${MAX_LENGTH} characters.` },
      { status: 400 }
    );
  }

  let threadId: string;
  let turns: Turn[];

  try {
    threadId = body.threadId ?? (await getOrCreateThread(user.id));

    // Persist the user's turn before calling the model, so nothing is lost
    // if the request dies mid-stream.
    await appendMessage(user.id, threadId, "user", message);

    // Gives the thread a name in the sidebar without prompting for one.
    await autoTitleThread(user.id, threadId, message);

    // History comes from the database rather than the client — the browser
    // shouldn't be trusted to say what was said earlier.
    const stored = await getMessages(user.id, threadId);
    turns = stored
      .filter((row) => row.role !== "system")
      .slice(-HISTORY_TURNS)
      .map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
      }));
  } catch (error) {
    console.error("[/api/chat] setup", error);
    const dbProblem = describeDbError(error);
    return Response.json(
      { error: dbProblem ?? "Something went wrong." },
      { status: dbProblem ? 503 : 500 }
    );
  }

  const encoder = new TextEncoder();
  const model = chosenModel ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let reply = "";

      try {
        for await (const delta of streamChat(turns, request.signal, chosenModel)) {
          reply += delta;
          controller.enqueue(encoder.encode(delta));
        }
      } catch (error) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        const detail =
          error instanceof Error ? error.message : "Unknown upstream error.";
        console.error("[/api/chat]", detail);
        const notice = `\n\n_Something went wrong: ${detail}_`;
        reply += notice;
        controller.enqueue(encoder.encode(notice));
      } finally {
        controller.close();

        if (reply.trim()) {
          // Store whatever was produced, including a partial reply from an
          // aborted stream — a half answer is still worth keeping.
          appendMessage(user.id, threadId, "assistant", reply, model).catch(
            (error) => console.error("[/api/chat] persist", error)
          );
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Thread-Id": threadId,
    },
  });
}
