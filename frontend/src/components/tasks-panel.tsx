"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tasks as seedTasks, type Task } from "@/lib/mock-data";

const priorityVariant = {
  high: "destructive",
  medium: "warning",
  low: "outline",
} as const;

export function TasksPanel({ compact = false }: { compact?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>(seedTasks);

  function toggle(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    );
  }

  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);
  const visible = compact ? open.slice(0, 4) : [...open, ...done];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h1 className="text-lg font-medium tracking-tight">Tasks</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {open.length} open · {done.length} completed
            </p>
          </div>
          <Button size="sm">
            <Plus />
            New task
          </Button>
        </div>
      )}

      <div
        className={cn(
          "scrollbar-thin flex-1 overflow-y-auto",
          compact ? "px-0" : "px-6 pb-6"
        )}
      >
        <div className="flex flex-col gap-1.5">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={toggle} />
          ))}
        </div>

        {compact && open.length > 4 && (
          <button className="text-muted-foreground hover:text-foreground mt-2 text-xs transition-colors">
            +{open.length - 4} more
          </button>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group hover:bg-card flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors",
        task.done && "opacity-45"
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        aria-label={task.done ? "Mark incomplete" : "Mark complete"}
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          task.done
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary"
        )}
      >
        {task.done && <Check className="size-3" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            task.done && "line-through"
          )}
        >
          {task.title}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-muted-foreground text-[0.7rem]">
            {task.due}
          </span>
          {!task.done && (
            <Badge variant={priorityVariant[task.priority]}>
              {task.priority}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
