"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckSquare, Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/lib/queries";

const priorityVariant = {
  high: "destructive",
  medium: "warning",
  low: "outline",
} as const;

export function TasksPanel({
  tasks,
  compact = false,
}: {
  tasks: TaskRow[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Tracks rows toggled locally so the checkbox responds before the round trip.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  function isDone(task: TaskRow) {
    return pending[task.id] ?? task.status === "done";
  }

  async function toggle(task: TaskRow) {
    const next = !isDone(task);
    setPending((prev) => ({ ...prev, [task.id]: next }));

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: next }),
      });

      if (!response.ok) throw new Error("failed");

      startTransition(() => router.refresh());
    } catch {
      // Put it back — the database didn't accept the change.
      setPending((prev) => {
        const copy = { ...prev };
        delete copy[task.id];
        return copy;
      });
    }
  }

  async function remove(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  const open = tasks.filter((task) => !isDone(task));
  const done = tasks.filter((task) => isDone(task));
  const visible = compact ? open.slice(0, 4) : [...open, ...done];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <>
          <div className="px-6 pt-6 pb-4">
            <h1 className="text-lg font-medium tracking-tight">Tasks</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {open.length} open · {done.length} completed
            </p>
          </div>
          <AddTask onAdded={() => startTransition(() => router.refresh())} />
        </>
      )}

      <div
        className={cn(
          "scrollbar-thin flex-1 overflow-y-auto",
          compact ? "px-0" : "px-6 pb-6"
        )}
      >
        {visible.length === 0 ? (
          <div
            className={cn(
              "text-muted-foreground flex flex-col items-center gap-2 text-center",
              compact ? "py-4" : "py-16"
            )}
          >
            <CheckSquare className="size-5 opacity-50" />
            <p className="text-xs">Nothing due.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((task) => (
              <TaskRowItem
                key={task.id}
                task={task}
                done={isDone(task)}
                onToggle={() => toggle(task)}
                onDelete={compact ? undefined : () => remove(task.id)}
              />
            ))}
          </div>
        )}

        {compact && open.length > 4 && (
          <p className="text-muted-foreground mt-2 text-xs">
            +{open.length - 4} more
          </p>
        )}
      </div>
    </div>
  );
}

function AddTask({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority, dueDate: dueDate || null }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save the task.");
        return;
      }

      setTitle("");
      setDueDate("");
      onAdded();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-6 pb-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task..."
          className="bg-card border-border focus:border-primary/50 placeholder:text-muted-foreground min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          aria-label="Priority"
          className="bg-card border-border focus:border-primary/50 rounded-lg border px-2 py-2 text-xs outline-none"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className="bg-card border-border focus:border-primary/50 rounded-lg border px-2 py-2 text-xs outline-none"
        />
        <Button onClick={add} disabled={busy || !title.trim()} size="icon" aria-label="Add task">
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
        </Button>
      </div>
      {error && <p className="text-destructive mt-1.5 text-xs">{error}</p>}
    </div>
  );
}

function TaskRowItem({
  task,
  done,
  onToggle,
  onDelete,
}: {
  task: TaskRow;
  done: boolean;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group hover:bg-card flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors",
        done && "opacity-45"
      )}
    >
      <button
        onClick={onToggle}
        aria-label={done ? "Mark incomplete" : "Mark complete"}
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          done
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary"
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", done && "line-through")}>
          {task.title}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          {task.due_label && (
            <span className="text-muted-foreground text-[0.7rem]">
              {task.due_label}
            </span>
          )}
          {!done && (
            <Badge variant={priorityVariant[task.priority]}>
              {task.priority}
            </Badge>
          )}
        </div>
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          aria-label={`Delete ${task.title}`}
          className="text-muted-foreground hover:text-destructive mt-0.5 shrink-0 opacity-0 transition-all group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
