"use client";

import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  LogOut,
  Mail,
  MessageSquare,
  Plug,
  Settings,
  StickyNote,
} from "lucide-react";

import { PixiLogo } from "@/components/pixi-logo";
import { cn } from "@/lib/utils";

export type PanelKey =
  | "chat"
  | "tasks"
  | "calendar"
  | "email"
  | "notes";

const navItems: { key: PanelKey; label: string; icon: typeof MessageSquare }[] =
  [
    { key: "chat", label: "Chat", icon: MessageSquare },
    { key: "tasks", label: "Tasks", icon: CheckSquare },
    { key: "calendar", label: "Calendar", icon: CalendarDays },
    { key: "email", label: "Email", icon: Mail },
    { key: "notes", label: "Notes", icon: StickyNote },
  ];

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export function Sidebar({
  active,
  onSelect,
  user,
}: {
  active: PanelKey;
  onSelect: (key: PanelKey) => void;
  user: { email: string; displayName: string | null };
}) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="bg-sidebar border-sidebar-border flex w-56 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <PixiLogo />
        <span className="text-sidebar-foreground text-[0.95rem] font-medium tracking-tight">
          Pixi
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {navItems.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="border-sidebar-border flex flex-col gap-0.5 border-t px-2 py-2">
        <button className="text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors">
          <Plug className="size-4 shrink-0" />
          Connections
          <span className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-[0.65rem]">
            0
          </span>
        </button>
        <button className="text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors">
          <Settings className="size-4 shrink-0" />
          Settings
        </button>
      </div>

      <div className="border-sidebar-border flex items-center gap-2.5 border-t px-4 py-3">
        <div className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
          {initials(user.displayName, user.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sidebar-foreground truncate text-xs font-medium">
            {user.displayName ?? user.email}
          </div>
          <div className="text-muted-foreground truncate text-[0.7rem]">
            {user.email}
          </div>
        </div>
        <button
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className="text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground shrink-0 rounded-md p-1.5 transition-colors"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}
