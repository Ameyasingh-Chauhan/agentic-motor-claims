import { useRouteError } from "react-router";
import { ErrorState } from "../../components/ui/EmptyState";

/** Top-level route error boundary: never a blank screen. */
export function RouteError() {
  const error = useRouteError();
  // A failed lazy chunk (e.g. after a redeploy) is fixed by reloading.
  const chunk = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(String(error?.message));
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-md">
        <ErrorState
          title={chunk ? "A new version is available" : "Something went wrong"}
          error={{ message: chunk ? "Reload to get the latest version of the app." : "An unexpected error occurred while showing this page." }}
          onRetry={() => window.location.reload()}
        />
      </div>
    </div>
  );
}
