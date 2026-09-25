"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { SELECTABLE_MODELS } from "@/lib/models";

export function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    SELECTABLE_MODELS.find((model) => model.id === value) ?? SELECTABLE_MODELS[3];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
      >
        {current.label}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="bg-popover border-border absolute left-0 top-full z-20 mt-1.5 w-60 overflow-hidden rounded-lg border shadow-lg"
        >
          {SELECTABLE_MODELS.map((model) => {
            const selected = model.id === value;
            return (
              <button
                key={model.id}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  selected ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <Check
                  className={cn(
                    "size-3 shrink-0",
                    selected ? "text-primary" : "opacity-0"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{model.label}</span>
                {model.hint && (
                  <span className="text-muted-foreground shrink-0 text-[0.65rem]">
                    {model.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
