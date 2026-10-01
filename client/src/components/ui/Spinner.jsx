import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/cn";

/** Inline spinner for buttons and small in-progress indicators (never for page content — use Skeleton). */
export function Spinner({ size = 16, className, label = "Loading" }) {
  return <LoaderCircle size={size} className={cn("spin shrink-0", className)} role="status" aria-label={label} />;
}
