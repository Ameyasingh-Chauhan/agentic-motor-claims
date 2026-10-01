import { Link } from "react-router";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";
import { Sparkline } from "./Sparkline";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./EmptyState";
import { formatPercent } from "../../lib/format";
import { cn } from "../../lib/cn";

/**
 * KpiCard (§7): label, value (anime.js counter), delta chip, sparkline, click-through link, skeleton.
 * `deltaSemantics`: "up-good" (default) or "up-bad" (e.g. fraud ▲ is bad) decides chip colour.
 */
export function KpiCard({
  label,
  value,
  format,
  delta,
  deltaLabel = "vs last period",
  deltaSemantics = "up-good",
  spark,
  sparkTone = "blue",
  to,
  icon: Icon,
  loading = false,
  error,
  onRetry,
  animateKey,
  className,
}) {
  if (loading) {
    return (
      <div className={cn("flex h-44 flex-col gap-3 rounded-lg border border-border bg-surface p-6 shadow-sm", className)} aria-busy="true">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-auto h-10 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className={cn("flex h-44 items-center justify-center rounded-lg border border-border bg-surface shadow-sm", className)}>
        <ErrorState compact title={`Couldn't load ${label.toLowerCase()}`} error={{ message: "" }} onRetry={onRetry} className="py-0" />
      </div>
    );
  }

  const up = delta > 0;
  const good = delta === 0 ? null : deltaSemantics === "up-good" ? up : !up;
  const Trend = up ? TrendingUp : TrendingDown;

  const body = (
    <>
      <div className="flex items-center gap-2">
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-muted text-blue-600">
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
        <span className="flex-1 text-sm font-medium text-muted">{label}</span>
        {to && <ArrowUpRight size={16} aria-hidden="true" className="text-subtle transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
      </div>
      <div className="num mt-2 text-3xl text-text">
        <AnimatedNumber value={value} format={format} animateKey={animateKey} />
      </div>
      {delta != null && (
        <div className="mt-1 flex items-center gap-2 text-caption">
          <span
            className={cn(
              "num inline-flex h-6 items-center gap-1 rounded-sm px-2",
              good === null && "bg-neutral-bg text-muted",
              good === true && "bg-success-bg text-success",
              good === false && "bg-danger-bg text-danger",
            )}
          >
            {delta !== 0 && <Trend size={14} aria-hidden="true" />}
            <span aria-hidden="true">{up ? "▲" : delta < 0 ? "▼" : ""}</span>
            {formatPercent(Math.abs(delta))}
            <span className="sr-only">{up ? "increase" : delta < 0 ? "decrease" : "no change"}</span>
          </span>
          <span className="text-subtle">{deltaLabel}</span>
        </div>
      )}
      <div className="mt-auto pt-3">{spark ? <Sparkline data={spark} tone={sparkTone} ariaLabel={`${label} trend`} /> : <div className="h-10" />}</div>
    </>
  );

  const cls = cn(
    "group flex h-44 flex-col rounded-lg border border-border bg-surface p-6 shadow-sm transition-[border-color,box-shadow] duration-150",
    to && "hover:border-border-strong hover:shadow-md",
    className,
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
