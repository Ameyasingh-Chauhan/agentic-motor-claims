import { lazy, Suspense } from "react";
import { Skeleton } from "../ui/Skeleton";
import { cn } from "../../lib/cn";

const EChart = lazy(() => import("./EChart"));

/** Lazy ECharts: the ECharts chunk loads only when a chart first renders. Same-size skeleton meanwhile. */
export function LazyEChart({ className, ...props }) {
  return (
    <Suspense fallback={<Skeleton className={cn("w-full", className)} rounded="lg" />}>
      <EChart className={className} {...props} />
    </Suspense>
  );
}
