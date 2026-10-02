import { useRef } from "react";
import { Link } from "react-router";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { FLAG_LEVELS } from "../../components/ui/StatusFlag";
import { Tooltip } from "../../components/ui/Tooltip";
import { formatDateTime, formatRelative } from "../../lib/format";
import { cn } from "../../lib/cn";
import { usePrefetchClaim } from "./useHomeData";

function ReasonFlag({ reason }) {
  const cfg = FLAG_LEVELS[reason.level] ?? FLAG_LEVELS.warn;
  return (
    <span className={cn("inline-flex h-7 max-w-full items-center gap-1 rounded-sm px-2 text-caption font-medium", cfg.cls)} title={reason.text}>
      <cfg.icon size={14} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{reason.text}</span>
    </span>
  );
}

function Row({ item, onIntent }) {
  const timer = useRef(0);
  return (
    <li
      className="flex h-18 items-center gap-4 px-6 transition-colors duration-150 hover:bg-bg-muted"
      onMouseEnter={() => { timer.current = setTimeout(() => onIntent(item.id), 150); }}
      onMouseLeave={() => clearTimeout(timer.current)}
    >
      <Avatar name={item.customer_name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">
          <span className="font-semibold">{item.customer_name}</span>
          <span className="text-muted"> · {item.city} · {item.vehicle.model} · </span>
          <span className="mono text-caption text-muted">{item.registration}</span>
        </p>
        <div className="mt-1 flex min-w-0"><ReasonFlag reason={item.reason} /></div>
      </div>
      <Tooltip content={`Reported ${formatDateTime(item.created_at)}`}>
        <span className="w-20 shrink-0 text-right text-caption text-muted">{formatRelative(item.created_at)}</span>
      </Tooltip>
      <Button size="sm" variant="secondary" to={`/claims/${item.id}`} aria-label={`Open claim ${item.id}`}>Open</Button>
    </li>
  );
}

/** Top claims that need a person: SIU, info requested, under review — SLA breaches and due-soon first. */
export function NeedsAttention({ items, loading, error, onRetry, customer }) {
  const prefetch = usePrefetchClaim();
  const title = customer ? "Claims needing your input" : "Needs attention";
  return (
    <Card
      title={title}
      subtitle={customer ? "Reply to these so we can keep your claim moving" : "Escalations, information requests and SLAs at risk"}
      actions={!customer && (
        <Link to="/?segment=pending_action#claims" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
          View all <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
      bodyClassName="px-0 pb-2"
    >
      {loading ? (
        <ul className="divide-y divide-border" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex h-18 items-center gap-4 px-6">
              <Skeleton rounded="full" className="h-8 w-8" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-7 flex-1" />
              <Skeleton className="h-8 w-16" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <ErrorState compact title="Couldn't load the attention list" error={error} onRetry={onRetry} />
      ) : !items?.length ? (
        <EmptyState compact title={customer ? "You're all set" : "Nothing needs attention"} description={customer ? "We'll message you if we need anything." : "Every open claim is within its SLA."}
          illustration={<CircleCheck size={40} className="text-success" aria-hidden="true" />} />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => <Row key={item.id} item={item} onIntent={prefetch} />)}
        </ul>
      )}
    </Card>
  );
}
