"use client";

import { Mail } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Placeholder until Gmail/Outlook is connected. There is deliberately no
 * email table yet, so this shows the real state rather than sample data.
 */
export function EmailPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-lg font-medium tracking-tight">Email</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            No account connected
          </p>
        </div>
      )}

      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-2 text-center",
          compact ? "py-4" : "px-6 pb-6"
        )}
      >
        <Mail className="text-muted-foreground size-5 opacity-50" />
        <p className="text-muted-foreground text-xs">
          Connect Gmail or Outlook to see your inbox here.
        </p>
      </div>
    </div>
  );
}
