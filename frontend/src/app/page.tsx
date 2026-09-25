import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import type { PanelKey } from "@/components/sidebar";
import { getSessionUser } from "@/lib/auth";
import {
  getMessages,
  getMonthEvents,
  getNotes,
  getOrCreateThread,
  getTasks,
  getThreads,
  getTodayEvents,
} from "@/lib/queries";

// Every panel reads live rows, so this can't be statically rendered.
export const dynamic = "force-dynamic";

const PANELS: PanelKey[] = ["chat", "tasks", "calendar", "email", "notes"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A database that's down shouldn't render a stack trace — send them to
  // the login screen, where the failure is reported in context.
  const user = await getSessionUser().catch((error) => {
    console.error("[home] session lookup failed", error);
    return null;
  });

  if (!user) redirect("/login");

  const params = await searchParams;
  const asString = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const threads = await getThreads(user.id);

  // Honour ?thread= only when it belongs to this user.
  const requested = asString(params.thread);
  const threadId =
    (requested && threads.some((thread) => thread.id === requested)
      ? requested
      : threads[0]?.id) ?? (await getOrCreateThread(user.id));

  // Today's date in the user's zone, for highlighting the calendar grid.
  const now = new Date();
  const localNow = new Date(
    now.toLocaleString("en-US", { timeZone: user.timezone })
  );
  const year = Number(asString(params.y)) || localNow.getFullYear();
  const month = Number(asString(params.m)) || localNow.getMonth() + 1;

  const safeYear = year >= 1970 && year <= 2200 ? year : localNow.getFullYear();
  const safeMonth = month >= 1 && month <= 12 ? month : localNow.getMonth() + 1;

  const todayIso = [
    localNow.getFullYear(),
    String(localNow.getMonth() + 1).padStart(2, "0"),
    String(localNow.getDate()).padStart(2, "0"),
  ].join("-");

  const [events, monthEvents, tasks, notes, history] = await Promise.all([
    getTodayEvents(user.id),
    getMonthEvents(user.id, safeYear, safeMonth),
    getTasks(user.id),
    getNotes(user.id),
    getMessages(user.id, threadId),
  ]);

  const view = asString(params.view);
  const initialPanel = PANELS.includes(view as PanelKey)
    ? (view as PanelKey)
    : "chat";

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      }}
      initialPanel={initialPanel}
      data={{
        events,
        monthEvents,
        tasks,
        notes,
        threads,
        threadId,
        history,
        year: safeYear,
        month: safeMonth,
        todayIso,
        defaultModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
      }}
    />
  );
}
