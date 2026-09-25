import { createThread, getThreads } from "@/lib/queries";
import { withUser } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser("threads:list", async (user) => {
  const threads = await getThreads(user.id);
  return Response.json({ threads });
});

export const POST = withUser("threads:create", async (user) => {
  const thread = await createThread(user.id);
  return Response.json({ ok: true, id: thread?.id }, { status: 201 });
});
