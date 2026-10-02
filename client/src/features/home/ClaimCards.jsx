import { memo, useRef } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { CircleX, TriangleAlert, CircleCheck } from "lucide-react";
import { ClaimStatusBadge } from "../../components/ui/StatusFlag";
import { RiskChip } from "../../components/ui/RiskChip";
import { formatDate, formatINR } from "../../lib/format";
import { VehicleThumb } from "./VehicleThumb";

function Flags({ flags }) {
  if (!flags) return null;
  if (!flags.red && !flags.amber) {
    return <span className="inline-flex items-center gap-1 text-caption text-success"><CircleCheck size={14} aria-hidden="true" />No flags</span>;
  }
  return (
    <span className="inline-flex items-center gap-3 text-caption">
      {flags.red > 0 && <span className="inline-flex items-center gap-1 text-danger"><CircleX size={14} aria-hidden="true" />{flags.red} critical</span>}
      {flags.amber > 0 && <span className="inline-flex items-center gap-1 text-warning"><TriangleAlert size={14} aria-hidden="true" />{flags.amber} warning</span>}
    </span>
  );
}

const ClaimCard = memo(function ClaimCard({ c, customer, onIntent, animate }) {
  const hover = useRef(0);
  const Comp = animate ? motion.li : "li";
  return (
    <Comp
      {...(animate ? { layout: "position", initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } } : {})}
      className="min-w-0"
    >
      <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }} className="h-full">
        <Link
          to={`/claims/${c.id}`}
          onMouseEnter={() => { hover.current = setTimeout(() => onIntent(c.id), 150); }}
          onMouseLeave={() => clearTimeout(hover.current)}
          className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-md"
        >
          <div className="relative">
            <VehicleThumb vehicle={c.vehicle} src={c.photo?.url} blur={c.photo?.blur_data} iconSize={40}
              label={c.incident.label} className="aspect-16/10 w-full rounded-none" />
            <span className="absolute top-3 left-3 rounded-sm bg-surface shadow-sm">
              <ClaimStatusBadge status={c.status} audience={customer ? "customer" : "handler"} />
            </span>
            {!customer && (
              <span className="absolute top-3 right-3 rounded-sm bg-surface shadow-sm"><RiskChip score={c.risk_score} /></span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="mono truncate text-caption text-muted">{c.id}</span>
              <span className="shrink-0 text-caption text-subtle">{formatDate(c.created_at)}</span>
            </div>
            <p className="truncate font-semibold text-text">{c.customer_name} <span className="font-normal text-muted">· {c.city}</span></p>
            <p className="truncate text-sm text-muted">{c.vehicle.make} {c.vehicle.model} · <span className="mono">{c.registration}</span></p>
            <div className="mt-auto flex items-end justify-between gap-2 pt-3">
              <span className="num text-lg text-text">{formatINR(c.amount_claimed)}</span>
              {!customer && <Flags flags={c.flags} />}
            </div>
          </div>
        </Link>
      </motion.div>
    </Comp>
  );
}, (a, b) => a.c.id === b.c.id && a.c.updated_at === b.c.updated_at && a.c.status === b.c.status
  && a.customer === b.customer && a.animate === b.animate && a.onIntent === b.onIntent);

/** Card view (§10.3 D): 3 columns, damage photo (16:10, blur placeholder) with status overlay. */
export function ClaimCards({ items, customer, onIntent, animateRows }) {
  return (
    <ul className="grid grid-cols-2 gap-6 p-6 xl:grid-cols-3">
      {items.map((c) => <ClaimCard key={c.id} c={c} customer={customer} onIntent={onIntent} animate={animateRows} />)}
    </ul>
  );
}
