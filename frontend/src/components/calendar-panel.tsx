"use client";

import { MapPin, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { events } from "@/lib/mock-data";

export function CalendarPanel({ compact = false }: { compact?: boolean }) {
  const today = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const visible = compact ? events.slice(0, 3) : events;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-lg font-medium tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{today}</p>
        </div>
      )}

      <div
        className={cn(
          "scrollbar-thin flex-1 overflow-y-auto",
          compact ? "px-0" : "px-6 pb-6"
        )}
      >
        <div className="flex flex-col">
          {visible.map((event, index) => (
            <div key={event.id} className="flex gap-3">
              <div className="flex w-16 shrink-0 flex-col items-end pt-2.5">
                <span className="text-muted-foreground text-[0.7rem] tabular-nums">
                  {event.start}
                </span>
              </div>

              <div className="flex flex-col items-center">
                <div className="bg-primary size-1.5 shrink-0 rounded-full" />
                {index < visible.length - 1 && (
                  <div className="bg-border w-px flex-1" />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-5">
                <p className="text-sm leading-snug font-medium">
                  {event.title}
                </p>
                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem]">
                  <span className="tabular-nums">
                    {event.start} – {event.end}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {event.location}
                    </span>
                  )}
                  {event.attendees && (
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {event.attendees}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
