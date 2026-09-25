import {
  dispatch,
  fileAccessBriefing,
  toolDeclarations,
  type FunctionCall,
} from "@/lib/tools";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const SYSTEM_PROMPT = `You are Pixi, a personal assistant for David.
You help with tasks, calendar, email and notes.
Be direct and concise — short paragraphs, no filler preamble.
You do not yet have live access to his accounts; if asked to read or change
real data, say plainly that the integration isn't connected yet.`;

export type Role = "user" | "assistant";

export type Turn = {
  role: Role;
  content: string;
};

type GeminiPart = {
  text?: string;
  // Reasoning models emit internal thought parts; they aren't for display.
  thought?: boolean;
  // Opaque reasoning token. Gemini 3.x rejects a tool round-trip that
  // doesn't echo it back alongside the functionCall.
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
};
type GeminiChunk = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  error?: { message?: string };
};

/** A turn in Gemini's own shape, so tool results can be appended. */
type GeminiContent = {
  role: "user" | "model";
  parts: Record<string, unknown>[];
};

/** Turns a raw upstream failure into something worth showing a user. */
function describe(status: number, body: string): string {
  if (status === 402) {
    return "Gemini billing: this project's prepayment credits are depleted. Top up or switch to a free-tier key at https://aistudio.google.com";
  }
  if (status === 401 || status === 403) {
    return "Gemini rejected the API key. Check GEMINI_API_KEY in frontend/.env.local";
  }
  if (status === 429) {
    return "Gemini rate limit reached. Wait a moment and try again.";
  }
  return `Gemini returned ${status}. ${body.slice(0, 200)}`;
}

/**
 * Worth trying the next model in the chain: 429/5xx mean the model is
 * saturated, 404 means it isn't available to this key.
 */
const RETRY_NEXT_MODEL = new Set([404, 429, 500, 502, 503, 504]);

const DEFAULT_FALLBACKS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

// The picker's model list lives in lib/models.ts so client components can
// import it without pulling this server-only module into the bundle.

function config(preferred?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to frontend/.env.local");
  }

  const primary = preferred ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  const fallbacks = process.env.GEMINI_FALLBACK_MODELS?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  // De-duplicate so the primary isn't retried twice.
  const chain = [primary, ...(fallbacks ?? DEFAULT_FALLBACKS)];
  return { apiKey, models: [...new Set(chain)] };
}

async function open(
  model: string,
  contents: GeminiContent[],
  systemPrompt: string,
  tools: unknown[] | null,
  signal?: AbortSignal
) {
  const { apiKey } = config(model);

  return fetch(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    signal,
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      ...(tools ? { tools } : {}),
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
}

/** A tool call plus the reasoning token that must travel back with it. */
type PendingCall = FunctionCall & { thoughtSignature?: string };

/** One pass over the model: yields text and collects any tool calls. */
type PassResult = {
  emitted: boolean;
  finishReason: string;
  calls: PendingCall[];
};

/**
 * Opens a stream against the first model in the chain that accepts it.
 *
 * Free-tier models return 503 under load, so the chain is tried in order.
 * Fallback only happens before the first token — once text is flowing,
 * switching models would duplicate output.
 */
async function openWithFallback(
  models: string[],
  contents: GeminiContent[],
  systemPrompt: string,
  tools: unknown[] | null,
  signal?: AbortSignal
): Promise<Response> {
  let lastError = "";

  for (const model of models) {
    const attempt = await open(model, contents, systemPrompt, tools, signal);

    if (attempt.ok && attempt.body) return attempt;

    const detail = await attempt.text().catch(() => "");
    lastError = describe(attempt.status, detail);

    if (!RETRY_NEXT_MODEL.has(attempt.status)) {
      // Auth and billing failures apply to every model — fail fast.
      throw new Error(lastError);
    }
  }

  throw new Error(`No model in the chain was available. ${lastError}`);
}

/** How many tool rounds before we stop, so a loop can't run forever. */
const MAX_TOOL_ROUNDS = 5;

/**
 * Streams assistant text from Gemini, running any tools it asks for and
 * feeding the results back until it produces a final answer.
 */
export async function* streamChat(
  turns: Turn[],
  signal?: AbortSignal,
  preferredModel?: string
): AsyncGenerator<string> {
  const { models } = config(preferredModel);

  const tools = await toolDeclarations();
  const systemPrompt = `${SYSTEM_PROMPT}\n\n${await fileAccessBriefing()}`;

  const contents: GeminiContent[] = turns.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  let emittedAnything = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await openWithFallback(
      models,
      contents,
      systemPrompt,
      tools,
      signal
    );

    const pass: PassResult = {
      emitted: false,
      finishReason: "",
      calls: [],
    };

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    /** Extracts text and tool calls from one SSE frame. */
    function readFrame(frame: string): string | null {
      const line = frame
        .split(/\r?\n/)
        .find((candidate) => candidate.startsWith("data:"));
      if (!line) return null;

      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return null;

      let parsed: GeminiChunk;
      try {
        parsed = JSON.parse(payload);
      } catch {
        return null;
      }

      if (parsed.error?.message) {
        throw new Error(parsed.error.message);
      }

      const candidate = parsed.candidates?.[0];
      if (candidate?.finishReason) pass.finishReason = candidate.finishReason;

      const parts = candidate?.content?.parts ?? [];

      for (const part of parts) {
        if (part.functionCall?.name) {
          pass.calls.push({
            name: part.functionCall.name,
            args: part.functionCall.args ?? {},
            thoughtSignature: part.thoughtSignature,
          });
        }
      }

      const text = parts
        // Reasoning models interleave thought parts — don't render those.
        .filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("");

      return text ? text : null;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Gemini sends CRLF, so match
      // both endings — splitting on "\n\n" alone never fires against \r\n\r\n.
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const text = readFrame(frame);
        if (text) {
          pass.emitted = true;
          emittedAnything = true;
          yield text;
        }
      }
    }

    // The last frame may arrive without a trailing blank line.
    const tail = readFrame(buffer);
    if (tail) {
      pass.emitted = true;
      emittedAnything = true;
      yield tail;
    }

    // No tools requested — this was the final answer.
    if (pass.calls.length === 0) {
      if (!emittedAnything) {
        if (pass.finishReason === "MAX_TOKENS") {
          throw new Error(
            "The model hit its output limit before replying. Try a shorter question."
          );
        }
        if (
          pass.finishReason === "SAFETY" ||
          pass.finishReason === "PROHIBITED_CONTENT"
        ) {
          throw new Error("The model declined to answer that.");
        }
        throw new Error(
          `The model returned no text${pass.finishReason ? ` (finish reason: ${pass.finishReason})` : ""}.`
        );
      }
      return;
    }

    if (round === MAX_TOOL_ROUNDS) {
      throw new Error(
        "The model kept asking for more file lookups without answering. Try a narrower question."
      );
    }

    // Record what it asked for, then hand back the results. The
    // thoughtSignature has to ride along or Gemini 3.x rejects the turn.
    contents.push({
      role: "model",
      parts: pass.calls.map((call) => ({
        functionCall: { name: call.name, args: call.args },
        ...(call.thoughtSignature
          ? { thoughtSignature: call.thoughtSignature }
          : {}),
      })),
    });

    const results = await Promise.all(
      pass.calls.map((call) => dispatch({ name: call.name, args: call.args }))
    );

    contents.push({
      role: "user",
      parts: results.map((result) => ({
        functionResponse: { name: result.name, response: result.response },
      })),
    });
  }
}
