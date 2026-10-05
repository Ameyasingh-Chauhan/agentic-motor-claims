import { Link } from "react-router";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";
import { Sparkline } from "./Sparkline";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./EmptyState";
import { formatPercent } from "../../lib/format";
import { cn } from "../../lib/cn";

const TINT = {
  blue: "bg-tint-blue-bg text-tint-blue",
  navy: "bg-tint-navy-bg text-tint-navy",
  green: "bg-tint-green-bg text-tint-green",
  red: "bg-tint-red-bg text-tint-red",
  orange: "bg-tint-orange-bg text-tint-orange",
  amber: "bg-tint-amber-bg text-tint-amber",
};
const SPARK_TONE = { blue: "blue", navy: "navy", green: "success", red: "danger", orange: "orange", amber: "amber" };

const shellBase = "flex h-full flex-col rounded-lg border border-border bg-surface shadow-sm";

/**
 * KpiCard (§7): tinted icon tile, one-line label, value (anime.js counter, once per `animateKey`), delta chip with
 * arrow, sparkline (or a custom `footer`), click-through link, skeleton and error states.
 * `deltaSemantics`: "up-good" (default) or "up-bad" (fraud, turnaround, pending ▲ are bad) decides the chip colour.
 * `deltaUnit`: "%" (relative change) or "pp" (percentage points, for rates).
 * `compact`: 16px padding and a 24px value, for a six-across KPI strip (Dashboard).
 */
export function KpiCard({
  label,
  value,
  valueNode,
  format,
  delta,
  deltaUnit = "%",
  deltaLabel = "vs prior 30 days",
  deltaSemantics = "up-good",
  spark,
  sparkTone,
  tone = "blue",
  footer,
  to,
  onClick,
  icon: Icon,
  loading = false,
  error,
  onRetry,
  animateKey,
  compact = false,
  className,
}) {
  const shell = cn(shellBase, compact ? "p-4" : "p-6");
  if (loading) {
    return (
      <div className={cn(shell, className)} aria-busy="true">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="mt-3 h-9 w-32" />
        <Skeleton className="mt-1 h-6 w-36" />
        <Skeleton className="mt-3 h-10 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className={cn(shell, "items-center justify-center", className)}>
        <ErrorState compact title={`Couldn't load ${label.toLowerCase()}`} error={{ message: "" }} onRetry={onRetry} className="py-0" />
      </div>
    );
  }

  const hasDelta = delta != null && Number.isFinite(delta);
  const up = hasDelta && delta > 0;
  const flat = !hasDelta || delta === 0;
  const good = flat ? null : deltaSemantics === "up-good" ? up : !up;
  const Arrow = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const deltaText = hasDelta ? (deltaUnit === "pp" ? `${Math.abs(delta).toFixed(1)} pp` : formatPercent(Math.abs(delta))) : "—";

  const body = (
    <>
      <div className="flex items-center gap-3">
        {Icon && (
          <span className={cn("flex shrink-0 items-center justify-center rounded-md", compact ? "h-8 w-8" : "h-10 w-10", TINT[tone] ?? TINT.blue)}>
            <Icon size={compact ? 16 : 20} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 truncate text-sm font-medium text-muted">{label}</span>
      </div>
      <div className={cn("num mt-3 truncate text-text", compact ? "text-2xl font-bold" : "text-3xl")}>
        {valueNode ?? <AnimatedNumber value={value} format={format} animateKey={animateKey} />}
      </div>
      <div className="mt-1 flex h-6 items-center gap-2 text-caption whitespace-nowrap">
        {delta !== undefined && (
          <>
            <span
              className={cn(
                "num inline-flex h-6 items-center gap-1 rounded-full px-2 font-semibold",
                good === null && "bg-neutral-bg text-muted",
                good === true && "bg-success-bg text-success",
                good === false && "bg-danger-bg text-danger",
              )}
            >
              <Arrow size={14} aria-hidden="true" />
              {deltaText}
              <span className="sr-only">{flat ? "no change" : up ? "increase" : "decrease"}</span>
            </span>
            {deltaLabel && <span className="truncate text-subtle">{deltaLabel}</span>}
          </>
        )}
      </div>
      <div className="mt-3 h-10">
        {footer ?? (spark ? <Sparkline data={spark} tone={sparkTone ?? SPARK_TONE[tone] ?? "blue"} ariaLabel={`${label} trend, last 12 periods`} /> : null)}
      </div>
    </>
  );

  if (!to && !onClick) return <div className={cn(shell, className)}>{body}</div>;
  const interactive = cn(shell, "group transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-md", className);
  return (
    <motion.div className="h-full" whileHover={{ y: -2 }} transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}>
      {to ? (
        <Link to={to} onClick={onClick} className={interactive} aria-label={`${label}: open matching claims`}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cn(interactive, "w-full text-left")}>
          {body}
        </button>
      )}
    </motion.div>
  );
}
