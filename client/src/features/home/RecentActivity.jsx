import { Link } from "react-router";
import { Bot, Building2, UserRound, UserRoundCheck } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { Tooltip } from "../../components/ui/Tooltip";
import { formatDateTime, formatRelative } from "../../lib/format";
import { cn } from "../../lib/cn";
import { AGENT_ICON } from "./constants";

const KIND = {
  agent: { cls: "bg-tint-blue-bg text-tint-blue", icon: Bot },
  human: { cls: "bg-tint-orange-bg text-tint-orange", icon: UserRoundCheck },
  customer: { cls: "bg-bg-muted text-muted", icon: UserRound },
  system: { cls: "bg-bg-muted text-muted", icon: Building2 },
};

/** Latest timeline events across claims — agent (blue) vs human (orange) actors, relative time with absolute tooltip. */
export function RecentActivity({ events, loading, error, onRetry, customer }) {
  return (
    <Card title={customer ? "Your recent updates" : "Recent activity"} bodyClassName="px-0 pt-2 pb-2" className="flex-1">
      {loading ? (
        <ul>{Array.from({ length: 6 }, (_, i) => <li key={i} className="flex h-14 items-center gap-3 px-6"><Skeleton className="h-8 w-8 rounded-md" /><Skeleton className="h-4 flex-1" /></li>)}</ul>
      ) : error ? (
        <ErrorState compact title="Couldn't load activity" error={error} onRetry={onRetry} />
      ) : !events?.length ? (
        <EmptyState compact title="No activity yet" description="Updates appear here as claims move." />
      ) : (
        <ul>
          {events.map((e, i) => {
            const kind = KIND[e.kind] ?? KIND.system;
            const agentKey = e.kind === "agent" ? e.actor.split(" ")[0].toLowerCase() : null;
            const Icon = (agentKey && AGENT_ICON[agentKey]) || kind.icon;
            return (
              <li key={`${e.claim_id}-${e.ts}-${i}`}>
                <Link to={`/claims/${e.claim_id}`} aria-label={`${e.actor}: ${e.text} — claim ${e.claim_id}`} title={`${e.claim_id}${customer ? "" : ` · ${e.customer_name}`}`}
                  className="flex h-14 items-center gap-3 px-6 transition-colors duration-150 hover:bg-bg-muted">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", kind.cls)}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">{e.text}</span>
                    <span className="block truncate text-caption text-muted">
                      <span className="font-medium text-text">{e.actor}</span>
                      {" · "}
                      <Tooltip content={formatDateTime(e.ts)}><span>{formatRelative(e.ts)}</span></Tooltip>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
