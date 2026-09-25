"use client";

import { useState } from "react";
import { CalendarDays, CheckSquare, Mail, StickyNote } from "lucide-react";

import { CalendarMonth } from "@/components/calendar-month";
import { CalendarPanel } from "@/components/calendar-panel";
import { ChatPanel } from "@/components/chat-panel";
import { EmailPanel } from "@/components/email-panel";
import { ModelPicker } from "@/components/model-picker";
import { NotesPanel } from "@/components/notes-panel";
import { Sidebar, type PanelKey } from "@/components/sidebar";
import { TasksPanel } from "@/components/tasks-panel";
import { ThreadList } from "@/components/thread-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setStoredModel, useStoredModel } from "@/lib/model-store";
import type {
  ChatRow,
  EventRow,
  MonthEvent,
  NoteRow,
  TaskRow,
  ThreadRow,
} from "@/lib/queries";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type ShellData = {
  events: EventRow[];
  monthEvents: MonthEvent[];
  tasks: TaskRow[];
  notes: NoteRow[];
  threads: ThreadRow[];
  threadId: string;
  history: ChatRow[];
  year: number;
  month: number;
  todayIso: string;
  defaultModel: string;
};

export function AppShell({
  user,
  data,
  initialPanel = "chat",
}: {
  user: CurrentUser;
  data: ShellData;
  initialPanel?: PanelKey;
}) {
  const [active, setActive] = useState<PanelKey>(initialPanel);
  // Remembered per browser; it's a preference, not shared state.
  const model = useStoredModel(data.defaultModel);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={active} onSelect={setActive} user={user} />

      <main className="flex min-w-0 flex-1">
        {active === "chat" ? (
          <>
            <ThreadList threads={data.threads} activeId={data.threadId} />

            <section className="flex min-w-0 flex-1 flex-col">
              <div className="border-border flex items-center justify-between border-b px-6 py-3">
                <div className="flex flex-col gap-0.5">
                  <h1 className="text-sm font-medium tracking-tight">Chat</h1>
                  <ModelPicker value={model} onChange={setStoredModel} />
                </div>
              </div>
              <ChatPanel
                key={data.threadId}
                threadId={data.threadId}
                history={data.history}
                model={model}
              />
            </section>

            <aside className="border-border scrollbar-thin hidden w-80 shrink-0 overflow-y-auto border-l p-4 2xl:block">
              <div className="flex flex-col gap-3">
                <RailCard title="Today" icon={CalendarDays}>
                  <CalendarPanel events={data.events} compact />
                </RailCard>
                <RailCard title="Due soon" icon={CheckSquare}>
                  <TasksPanel tasks={data.tasks} compact />
                </RailCard>
                <RailCard title="Inbox" icon={Mail}>
                  <EmailPanel compact />
                </RailCard>
                <RailCard title="Notes" icon={StickyNote}>
                  <NotesPanel notes={data.notes} compact />
                </RailCard>
              </div>
            </aside>
          </>
        ) : (
          <section className="relative flex min-w-0 flex-1 flex-col">
            {active === "tasks" && <TasksPanel tasks={data.tasks} />}
            {active === "calendar" && (
              <CalendarMonth
                events={data.monthEvents}
                year={data.year}
                month={data.month}
                todayIso={data.todayIso}
              />
            )}
            {active === "email" && <EmailPanel />}
            {active === "notes" && <NotesPanel notes={data.notes} />}
          </section>
        )}
      </main>
    </div>
  );
}

function RailCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof CalendarDays;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Icon className="text-muted-foreground size-3.5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
