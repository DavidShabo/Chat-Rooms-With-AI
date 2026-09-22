"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { emails } from "@/lib/mock-data";

export function EmailPanel({ compact = false }: { compact?: boolean }) {
  const unread = emails.filter((email) => email.unread).length;
  const visible = compact ? emails.slice(0, 3) : emails;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-lg font-medium tracking-tight">Email</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {unread} unread across 2 accounts
          </p>
        </div>
      )}

      <div
        className={cn(
          "scrollbar-thin flex-1 overflow-y-auto",
          compact ? "px-0" : "px-6 pb-6"
        )}
      >
        <div className="flex flex-col gap-0.5">
          {visible.map((email) => (
            <button
              key={email.id}
              className="hover:bg-card group flex flex-col gap-1 rounded-lg px-2.5 py-2.5 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                {email.unread && (
                  <span className="bg-primary size-1.5 shrink-0 rounded-full" />
                )}
                <span
                  className={cn(
                    "truncate text-sm",
                    email.unread ? "font-medium" : "text-muted-foreground"
                  )}
                >
                  {email.from}
                </span>
                <Badge variant="outline" className="ml-auto shrink-0">
                  {email.account}
                </Badge>
                <span className="text-muted-foreground shrink-0 text-[0.7rem] tabular-nums">
                  {email.receivedAt}
                </span>
              </div>
              <p
                className={cn(
                  "truncate text-sm",
                  email.unread ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {email.subject}
              </p>
              <p className="text-muted-foreground line-clamp-1 text-xs">
                {email.preview}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
