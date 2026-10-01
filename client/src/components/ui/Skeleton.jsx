import { cn } from "../../lib/cn";

/** Skeleton block. Size it to match final content so nothing shifts when data arrives. */
export function Skeleton({ className, rounded = "sm", style }) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn("skeleton block", rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-lg" : "rounded-sm", className)}
    />
  );
}

/** Several text-line skeletons; the last line is shorter. */
export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

/** Wrapper announcing a loading region to assistive tech. */
export function LoadingRegion({ label = "Loading", children, className }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
