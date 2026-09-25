"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NoteRow } from "@/lib/queries";

export function NotesPanel({
  notes,
  compact = false,
}: {
  notes: NoteRow[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const body = draft.trim();
    if (!body || busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save the note.");
        return;
      }

      setDraft("");
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  const visible = compact ? notes.slice(0, 3) : notes;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-lg font-medium tracking-tight">Notes</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {notes.length} saved
          </p>
        </div>
      )}

      <div className={cn(compact ? "px-0 pb-3" : "px-6 pb-3")}>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            disabled={busy}
            placeholder="Jot something down..."
            className="bg-card border-border focus:border-primary/50 placeholder:text-muted-foreground flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors disabled:opacity-60"
          />
          <Button
            size="icon"
            onClick={add}
            disabled={busy || !draft.trim()}
            aria-label="Add note"
          >
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </div>
        {error && (
          <p className="text-destructive mt-1.5 text-xs">{error}</p>
        )}
      </div>

      <div
        className={cn(
          "scrollbar-thin flex-1 overflow-y-auto",
          compact ? "px-0" : "px-6 pb-6"
        )}
      >
        {visible.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            No notes yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((note) => (
              <div
                key={note.id}
                className="bg-card border-border group flex items-start gap-2 rounded-lg border px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug break-words">{note.body}</p>
                  <span className="text-muted-foreground mt-1.5 block text-[0.7rem]">
                    {note.created_label}
                  </span>
                </div>
                {!compact && (
                  <button
                    onClick={() => remove(note.id)}
                    aria-label="Delete note"
                    className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-all group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
