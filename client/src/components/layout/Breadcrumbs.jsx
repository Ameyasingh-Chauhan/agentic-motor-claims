import { Link, useMatches } from "react-router";
import { ChevronRight } from "lucide-react";

/** Breadcrumbs from route `handle.crumb` (string or (match) => string). Last crumb is the page title. */
export function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .filter((m) => m.handle?.crumb)
    .map((m) => ({ to: m.pathname, label: typeof m.handle.crumb === "function" ? m.handle.crumb(m) : m.handle.crumb }));
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.to} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-subtle" />}
              {last ? (
                <span aria-current="page" className="truncate font-semibold text-text">
                  {c.label}
                </span>
              ) : (
                <Link to={c.to} className="truncate text-muted hover:text-text">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
