"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MonthEvent } from "@/lib/queries";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The 42 cells of a month grid, including leading/trailing days. */
function buildGrid(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const offset = first.getDay();
  const cells: { date: string; day: number; inMonth: boolean }[] = [];

  const prevLast = new Date(year, month - 1, 0).getDate();
  for (let i = offset - 1; i >= 0; i--) {
    const d = prevLast - i;
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    cells.push({ date: isoDate(y, m, d), day: d, inMonth: false });
  }

  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ date: isoDate(year, month, d), day: d, inMonth: true });
  }

  let next = 1;
  while (cells.length < 42) {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    cells.push({ date: isoDate(y, m, next), day: next, inMonth: false });
    next++;
  }

  return cells;
}

export function CalendarMonth({
  events,
  year,
  month,
  todayIso,
}: {
  events: MonthEvent[];
  year: number;
  month: number;
  todayIso: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const byDate = useMemo(() => {
    const map: Record<string, MonthEvent[]> = {};
    for (const event of events) {
      (map[event.local_date] ??= []).push(event);
    }
    return map;
  }, [events]);

  const label = new Date(year, month - 1, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  function go(delta: number) {
    const target = new Date(year, month - 1 + delta, 1);
    const params = new URLSearchParams({
      y: String(target.getFullYear()),
      m: String(target.getMonth() + 1),
    });
    startTransition(() => router.push(`/?view=calendar&${params}`));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div>
          <h1 className="text-lg font-medium tracking-tight">{label}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {events.length} {events.length === 1 ? "event" : "events"} this month
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => go(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              startTransition(() =>
                router.push(`/?view=calendar&y=${now.getFullYear()}&m=${now.getMonth() + 1}`)
              );
            }}
          >
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => go(1)} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-muted-foreground pb-2 text-center text-[0.7rem] font-medium"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="bg-border grid min-h-0 flex-1 grid-cols-7 gap-px overflow-hidden rounded-lg border">
          {grid.map((cell) => {
            const dayEvents = byDate[cell.date] ?? [];
            const isToday = cell.date === todayIso;

            return (
              <button
                key={cell.date}
                onClick={() => setSelected(cell.date)}
                className={cn(
                  "group bg-background flex min-h-0 flex-col gap-1 p-1.5 text-left transition-colors",
                  cell.inMonth ? "hover:bg-card" : "opacity-40 hover:opacity-60"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[0.7rem] tabular-nums",
                      isToday
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {cell.day}
                  </span>
                  <Plus className="text-muted-foreground size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>

                <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      title={event.title}
                      className="bg-primary/15 text-primary truncate rounded px-1 py-0.5 text-[0.65rem] leading-tight"
                    >
                      {!event.is_all_day && (
                        <span className="opacity-70">{event.start_label} </span>
                      )}
                      {event.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-muted-foreground px-1 text-[0.65rem]">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <DayPanel
          date={selected}
          events={byDate[selected] ?? []}
          onClose={() => setSelected(null)}
          onChanged={() => startTransition(() => router.refresh())}
        />
      )}
    </div>
  );
}

function DayPanel({
  date,
  events,
  onClose,
  onChanged,
}: {
  date: string;
  events: MonthEvent[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heading = new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          date,
          startTime: startTime || null,
          endTime: endTime || startTime || null,
          location: location || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save the event.");
        return;
      }

      setTitle("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      onChanged();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="border-border bg-card absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-y-auto border-t p-5 shadow-lg">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">{heading}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        {events.length > 0 && (
          <div className="mb-4 flex flex-col gap-1">
            {events.map((event) => (
              <div
                key={event.id}
                className="border-border group flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
                  {event.is_all_day ? "All day" : event.start_label}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {event.title}
                  {event.location && (
                    <span className="text-muted-foreground"> · {event.location}</span>
                  )}
                </span>
                <button
                  onClick={() => remove(event.id)}
                  aria-label={`Delete ${event.title}`}
                  className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-all group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Add an event..."
            className="bg-background border-border focus:border-primary/50 placeholder:text-muted-foreground rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
          />
          <div className="flex flex-wrap gap-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-label="Start time"
              className="bg-background border-border focus:border-primary/50 w-28 rounded-lg border px-2 py-1.5 text-xs outline-none"
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-label="End time"
              className="bg-background border-border focus:border-primary/50 w-28 rounded-lg border px-2 py-1.5 text-xs outline-none"
            />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="bg-background border-border focus:border-primary/50 placeholder:text-muted-foreground min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none"
            />
            <Button size="sm" onClick={add} disabled={busy || !title.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              Add
            </Button>
          </div>
          <p className="text-muted-foreground text-[0.7rem]">
            Leave the times blank for an all-day event.
          </p>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      </div>
    </div>
  );
}
