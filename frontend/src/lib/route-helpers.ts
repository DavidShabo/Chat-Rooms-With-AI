import { getSessionUser, type SessionUser } from "@/lib/auth";
import { describeDbError } from "@/lib/db";

/**
 * Wraps a route handler with the session check and error translation every
 * authenticated endpoint needs, so each route only holds its own logic.
 */
export function withUser(
  label: string,
  handler: (user: SessionUser, request: Request, params: Record<string, string>) => Promise<Response>
) {
  return async (
    request: Request,
    context?: { params?: Promise<Record<string, string>> }
  ): Promise<Response> => {
    try {
      const user = await getSessionUser();
      if (!user) {
        return Response.json({ error: "Not signed in." }, { status: 401 });
      }

      const params = context?.params ? await context.params : {};
      return await handler(user, request, params);
    } catch (error) {
      console.error(`[${label}]`, error);
      const dbProblem = describeDbError(error);
      return Response.json(
        { error: dbProblem ?? "Something went wrong." },
        { status: dbProblem ? 503 : 500 }
      );
    }
  };
}

/** Parses a JSON body, returning null when it isn't valid JSON. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found.") {
  return Response.json({ error: message }, { status: 404 });
}
