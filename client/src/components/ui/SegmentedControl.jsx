import { useId } from "react";
import { motion } from "motion/react";
import { SPRING } from "../../lib/motion";
import { cn } from "../../lib/cn";

/**
 * Segmented control (radiogroup). options: [{ value, label, icon? }]. The selected pill slides between
 * options with a shared `layoutId` (spring, no overshoot). Arrow keys move the selection.
 */
export function SegmentedControl({ options, value, onChange, label, className, size = "md" }) {
  const id = useId();
  const move = (dir) => {
    const i = options.findIndex((o) => o.value === value);
    onChange(options[(i + dir + options.length) % options.length].value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
              size === "sm" ? "h-7" : "h-8",
              active ? "text-orange-700" : "text-muted hover:text-text",
            )}
          >
            {active && (
              <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-sm bg-bg-muted" transition={SPRING} aria-hidden="true" />
            )}
            {o.icon && <o.icon size={16} aria-hidden="true" className="relative" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
