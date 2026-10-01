import { cn } from "../../lib/cn";

const tones = {
  primary: "bg-primary",
  blue: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Linear progress. `value` 0–100; omit for indeterminate. Fill animates with transform (scaleX) only.
 */
export function Progress({ value, tone = "primary", size = "md", label, showValue = false, className }) {
  const indeterminate = value == null;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-caption text-muted">
          <span>{label}</span>
          {showValue && !indeterminate && <span className="num">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label || "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        className={cn("relative w-full overflow-hidden rounded-full bg-neutral-bg", size === "sm" ? "h-1" : "h-2")}
      >
        {indeterminate ? (
          <span className={cn("progress-indeterminate absolute inset-y-0 left-0 w-1/3 rounded-full", tones[tone])} />
        ) : (
          <span
            className={cn("block h-full w-full origin-left rounded-full transition-transform duration-500 ease-standard", tones[tone])}
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        )}
      </div>
    </div>
  );
}
