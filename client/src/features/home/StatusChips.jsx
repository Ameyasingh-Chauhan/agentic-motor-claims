import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { formatNumber } from "../../lib/format";
import { SPRING } from "../../lib/motion";
import { cn } from "../../lib/cn";
import { ADMIN_CHIPS, CUSTOMER_CHIPS, statusDot, statusLabel } from "./constants";

function Count({ value }) {
  return (
    <span className="relative inline-flex h-5 min-w-6 items-center justify-center overflow-hidden rounded-full bg-bg-muted px-1.5 text-caption">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} className="num" initial={{ opacity: 0, transform: "translateY(6px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }} exit={{ opacity: 0, transform: "translateY(-6px)" }}
          transition={{ duration: 0.18 }}>
          {formatNumber(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Status chips (§10.3 D): "All" first, human-readable labels with a status dot, live counts (respecting every
 * other filter), and an indicator that slides to the active chip (shared layoutId, spring without overshoot).
 */
export function StatusChips({ value, counts, allCount, onChange, customer }) {
  const keys = (customer ? CUSTOMER_CHIPS : ADMIN_CHIPS).filter((k) => !customer || counts?.[k]);
  const chips = [{ key: "", label: "All", count: allCount ?? 0 }, ...keys.map((k) => ({ key: k, label: statusLabel(k, customer), count: counts?.[k] ?? 0 }))];
  return (
    <LayoutGroup id="status-chips">
      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2 px-6 py-3">
        {chips.map((c) => {
          const active = (value || "") === c.key;
          return (
            <button
              key={c.key || "all"}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(c.key)}
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                active ? "border-transparent text-orange-700" : "border-border text-muted hover:border-border-strong hover:text-text",
                !active && c.count === 0 && "opacity-60",
              )}
            >
              {active && (
                <motion.span layoutId="status-chip-indicator" transition={SPRING} aria-hidden="true"
                  className="absolute inset-0 rounded-full border border-orange-600 bg-bg-muted" />
              )}
              {c.key && <span className={cn("relative h-2 w-2 rounded-full", statusDot(c.key))} aria-hidden="true" />}
              <span className="relative">{c.label}</span>
              <span className="relative"><Count value={c.count} /></span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
