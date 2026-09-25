import { cn } from "@/lib/utils";

/**
 * Pixi's mark: a rounded tile with a pixel-grid "P" knocked out of it, and a
 * detached spark at the top right. The pixel motif nods at the name; the
 * spark marks it as an assistant rather than a generic app tile.
 */
export function PixiLogo({
  className,
  title = "Pixi",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={cn("size-7", className)}
    >
      <defs>
        <linearGradient id="pixi-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.70 0.19 296)" />
          <stop offset="100%" stopColor="oklch(0.55 0.22 288)" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="32" height="32" rx="9" fill="url(#pixi-mark)" />

      {/* Pixel-block "P" */}
      <g fill="oklch(0.99 0 0)">
        <rect x="9"  y="8"  width="3.4" height="16" rx="1" />
        <rect x="13.4" y="8"  width="6"   height="3.4" rx="1" />
        <rect x="13.4" y="14.6" width="6" height="3.4" rx="1" />
        <rect x="19.6" y="10.4" width="3.4" height="6" rx="1" />
      </g>

      {/* Spark */}
      <circle cx="25" cy="7" r="2.6" fill="oklch(0.99 0 0)" />
      <circle cx="25" cy="7" r="2.6" fill="url(#pixi-mark)" opacity="0.25" />
    </svg>
  );
}

export function PixiWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <PixiLogo />
      <span className="text-[0.95rem] font-medium tracking-tight">Pixi</span>
    </span>
  );
}
