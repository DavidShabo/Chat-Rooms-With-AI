"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ThreadRow } from "@/lib/queries";

export function ThreadList({
  threads,
  activeId,
}: {
  threads: ThreadRow[];
  activeId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function newChat() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/threads", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (data.id) {
        startTransition(() => router.push(`/?thread=${data.id}`));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    // Leaving the thread you're viewing should land you somewhere valid.
    const next = threads.find((thread) => thread.id !== id);
    startTransition(() =>
      router.push(next && id === activeId ? `/?thread=${next.id}` : "/")
    );
  }

  return (
    <div className="border-border bg-sidebar/40 flex w-56 shrink-0 flex-col border-r">
      <div className="px-3 py-3">
        <Button
          size="sm"
          onClick={newChat}
          disabled={busy}
          className="w-full justify-start"
        >
          <Plus />
          New chat
        </Button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2">
        {threads.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-xs">
            No conversations yet.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {threads.map((thread) => {
              const isActive = thread.id === activeId;
              return (
                <div
                  key={thread.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50"
                  )}
                >
                  <button
                    onClick={() =>
                      startTransition(() => router.push(`/?thread=${thread.id}`))
                    }
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                  >
                    <span
                      className={cn(
                        "w-full truncate text-xs",
                        isActive ? "font-medium" : "text-muted-foreground"
                      )}
                    >
                      {thread.title ?? "New conversation"}
                    </span>
                    <span className="text-muted-foreground text-[0.65rem]">
                      {thread.updated_label}
                    </span>
                  </button>

                  <button
                    onClick={() => remove(thread.id)}
                    aria-label="Delete conversation"
                    className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-all group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-border text-muted-foreground flex items-center gap-1.5 border-t px-3 py-2 text-[0.65rem]">
        <MessageSquare className="size-3" />
        {threads.length} {threads.length === 1 ? "conversation" : "conversations"}
      </div>
    </div>
  );
}
