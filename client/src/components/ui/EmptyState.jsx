import { RefreshCw } from "lucide-react";
import { Button } from "./Button";
import { EmptyIllustration, ErrorIllustration } from "./Illustrations";
import { cn } from "../../lib/cn";

/** Empty state: illustration, title, one-line explanation, primary action (§7). */
export function EmptyState({ title, description, action, illustration, compact = false, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-8" : "gap-3 py-12", className)}>
      {illustration ?? <EmptyIllustration className={compact ? "h-16 w-24" : "h-24 w-36"} />}
      <h3 className={cn("text-text", compact ? "text-base font-semibold" : "text-lg")}>{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Error state with retry. `error` may be an Error or a {message, error_id} object. */
export function ErrorState({ title = "Something went wrong", error, onRetry, retrying = false, compact = false, className }) {
  const message = error?.message || "We couldn't load this. Check your connection and try again.";
  const errorId = error?.error_id || error?.errorId;
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-8" : "gap-3 py-12", className)}
    >
      <ErrorIllustration className={compact ? "h-16 w-24" : "h-24 w-36"} />
      <h3 className={cn("text-text", compact ? "text-base font-semibold" : "text-lg")}>{title}</h3>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {errorId && <p className="mono text-caption text-subtle">Error ID: {errorId}</p>}
      {onRetry && (
        <Button variant="secondary" icon={RefreshCw} loading={retrying} onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}
