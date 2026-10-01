import { cn } from "../../lib/cn";

const tones = {
  neutral: "bg-neutral-bg text-text border-transparent",
  blue: "bg-transparent text-blue-600 border-blue-600",
  orange: "bg-transparent text-orange-700 border-orange-700",
  success: "bg-success-bg text-success border-transparent",
  warning: "bg-warning-bg text-warning border-transparent",
  danger: "bg-danger-bg text-danger border-transparent",
  outline: "bg-transparent text-muted border-border-strong",
};

/** Small label chip (12px, radius 6). For status, prefer StatusFlag / ClaimStatusBadge. */
export function Badge({ tone = "neutral", icon: Icon, children, className, mono = false }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-caption whitespace-nowrap",
        mono && "mono",
        tones[tone],
        className,
      )}
    >
      {Icon && <Icon size={14} aria-hidden="true" className="shrink-0" />}
      {children}
    </span>
  );
}

/** Count bubble for tabs / bell. */
export function CountBadge({ count, tone = "orange", className }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-caption",
        tone === "orange" && "bg-primary text-on-primary",
        tone === "neutral" && "bg-neutral-bg text-muted",
        tone === "danger" && "bg-danger text-on-status",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
