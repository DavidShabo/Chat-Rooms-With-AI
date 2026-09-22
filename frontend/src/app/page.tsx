"use client";

import { useState } from "react";
import { CalendarDays, CheckSquare, Mail, StickyNote } from "lucide-react";

import { CalendarPanel } from "@/components/calendar-panel";
import { ChatPanel } from "@/components/chat-panel";
import { EmailPanel } from "@/components/email-panel";
import { NotesPanel } from "@/components/notes-panel";
import { Sidebar, type PanelKey } from "@/components/sidebar";
import { TasksPanel } from "@/components/tasks-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const [active, setActive] = useState<PanelKey>("chat");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={active} onSelect={setActive} />

      <main className="flex min-w-0 flex-1">
        {active === "chat" ? (
          <>
            <section className="flex min-w-0 flex-1 flex-col">
              <Header
                title="Chat"
                subtitle="Not connected to a backend yet"
              />
              <ChatPanel />
            </section>

            <aside className="border-border scrollbar-thin hidden w-80 shrink-0 overflow-y-auto border-l p-4 xl:block">
              <div className="flex flex-col gap-3">
                <RailCard title="Today" icon={CalendarDays}>
                  <CalendarPanel compact />
                </RailCard>
                <RailCard title="Due soon" icon={CheckSquare}>
                  <TasksPanel compact />
                </RailCard>
                <RailCard title="Inbox" icon={Mail}>
                  <EmailPanel compact />
                </RailCard>
                <RailCard title="Notes" icon={StickyNote}>
                  <NotesPanel compact />
                </RailCard>
              </div>
            </aside>
          </>
        ) : (
          <section className="flex min-w-0 flex-1 flex-col">
            {active === "tasks" && <TasksPanel />}
            {active === "calendar" && <CalendarPanel />}
            {active === "email" && <EmailPanel />}
            {active === "notes" && <NotesPanel />}
          </section>
        )}
      </main>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-border flex items-center justify-between border-b px-6 py-3.5">
      <div>
        <h1 className="text-sm font-medium tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>
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
