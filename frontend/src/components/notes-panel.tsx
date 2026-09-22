"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notes as seedNotes, type Note } from "@/lib/mock-data";

export function NotesPanel({ compact = false }: { compact?: boolean }) {
  const [notes, setNotes] = useState<Note[]>(seedNotes);
  const [draft, setDraft] = useState("");

  function add() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setNotes((prev) => [
      { id: crypto.randomUUID(), body: trimmed, createdAt: "Just now" },
      ...prev,
    ]);
    setDraft("");
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
            placeholder="Jot something down..."
            className="bg-card border-border focus:border-primary/50 placeholder:text-muted-foreground flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
          />
          <Button size="icon" onClick={add} aria-label="Add note">
            <Plus />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "scrollbar-thin flex-1 overflow-y-auto",
          compact ? "px-0" : "px-6 pb-6"
        )}
      >
        <div className="flex flex-col gap-1.5">
          {visible.map((note) => (
            <div
              key={note.id}
              className="bg-card border-border rounded-lg border px-3 py-2.5"
            >
              <p className="text-sm leading-snug">{note.body}</p>
              <span className="text-muted-foreground mt-1.5 block text-[0.7rem]">
                {note.createdAt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
