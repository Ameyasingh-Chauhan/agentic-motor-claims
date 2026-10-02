import { memo, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { CircleCheck, Copy, Ellipsis, ExternalLink, FileText } from "lucide-react";
import { Avatar } from "../../components/ui/Avatar";
import { IconButton } from "../../components/ui/Button";
import { DropdownMenu } from "../../components/ui/Popover";
import { ClaimStatusBadge } from "../../components/ui/StatusFlag";
import { RiskChip } from "../../components/ui/RiskChip";
import { Tooltip } from "../../components/ui/Tooltip";
import { formatDate, formatDateTime, formatINR, formatRelative, formatTime } from "../../lib/format";
import { cn } from "../../lib/cn";
import { INCIDENT_ICONS } from "./constants";
import { VehicleThumb } from "./VehicleThumb";

const WIDE_FROM = 1360; // px of table width: below this, Reported/Updated fold under the claim ID and thumbnails hide
const TD = "overflow-hidden border-b border-border px-3 py-2 align-middle";
const TH = "bg-surface px-3 py-3 text-left text-caption font-semibold text-muted border-b border-border whitespace-nowrap";
// Each query (filter/sort/page) returns fresh objects, so compare what a row actually shows.
export const sameClaim = (a, b) => a.c.id === b.c.id && a.c.updated_at === b.c.updated_at && a.c.status === b.c.status
  && a.customer === b.customer && a.wide === b.wide && a.animate === b.animate && a.onIntent === b.onIntent;
const ROW_MOTION = { layout: "position", initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };

function RowMenu({ id }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu
      trigger={<IconButton icon={Ellipsis} label={`Actions for ${id}`} size="sm" tooltip={false} />}
      items={[
        { label: "Open", icon: FileText, onSelect: () => navigate(`/claims/${id}`) },
        { label: "Copy claim ID", icon: Copy, onSelect: () => navigator.clipboard?.writeText(id).then(() => toast.success(`Copied ${id}`)).catch(() => toast.error("Couldn't copy")) },
        { label: "Open in new tab", icon: ExternalLink, onSelect: () => window.open(`/claims/${id}`, "_blank", "noopener") },
      ]}
    />
  );
}

function onRowKeyDown(e, open) {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter") open();
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling)?.focus();
  }
}

/** One row. Memoised: a filter/sort change only renders rows whose data or layout mode changed. */
const ClaimRow = memo(function ClaimRow({ c, customer, wide, animate, onIntent }) {
  const navigate = useNavigate();
  const hover = useRef(0);
  const open = () => navigate(`/claims/${c.id}`);
  const IncidentIcon = INCIDENT_ICONS[c.incident.type] ?? FileText;
  const Row = animate ? motion.tr : "tr";
  return (
    <Row
      {...(animate ? ROW_MOTION : {})}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => onRowKeyDown(e, open)}
      onMouseEnter={() => { hover.current = setTimeout(() => onIntent(c.id), 150); }}
      onMouseLeave={() => clearTimeout(hover.current)}
      className="group h-14 cursor-pointer outline-none transition-colors duration-150 hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
    >
      <td className={cn(TD, "pl-6")}>
        <p className="mono text-caption whitespace-nowrap text-text">{c.id}</p>
        {!wide && (
          <Tooltip content={`Reported ${formatDateTime(c.created_at)} · updated ${formatRelative(c.updated_at)}`}>
            <p className="text-caption whitespace-nowrap text-muted">{formatDate(c.created_at)}</p>
          </Tooltip>
        )}
      </td>
      {!customer && (
        <td className={TD}>
          <div className="flex min-w-0 items-center gap-2" title={`${c.customer_name}, ${c.city}`}>
            <Avatar name={c.customer_name} size={wide ? "sm" : "xs"} />
            <div className="min-w-0">
              <p className="truncate font-medium text-text">{c.customer_name}</p>
              <p className="truncate text-caption text-muted">{c.city}</p>
            </div>
          </div>
        </td>
      )}
      <td className={TD}>
        <div className="flex min-w-0 items-center gap-2">
          {wide && <VehicleThumb vehicle={c.vehicle} className="h-8 w-12" />}
          <div className="min-w-0">
            <p className="truncate text-text">{c.vehicle.model}</p>
            <p className="mono truncate text-caption text-muted">{c.registration}</p>
          </div>
        </div>
      </td>
      <td className={TD}>
        <Tooltip content={c.incident.description} className="block w-full min-w-0">
          <span className="flex w-full min-w-0 items-center gap-2">
            <IncidentIcon size={16} aria-hidden="true" className="shrink-0 text-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-text">{c.incident.label}</span>
              <span className="block truncate text-caption text-muted">{c.incident.description}</span>
            </span>
          </span>
        </Tooltip>
      </td>
      {wide && (
        <td className={TD}>
          <p className="whitespace-nowrap text-text">{formatDate(c.created_at)}</p>
          <p className="text-caption whitespace-nowrap text-muted">{formatTime(c.created_at)}</p>
        </td>
      )}
      <td className={cn(TD, "text-right")}>
        <p className="num font-medium whitespace-nowrap text-text">{formatINR(c.amount_claimed)}</p>
        {c.amount_approved > 0 && (
          <p className="num inline-flex items-center gap-1 text-caption whitespace-nowrap text-success" title="Approved amount">
            <CircleCheck size={12} aria-hidden="true" />{formatINR(c.amount_approved)}<span className="sr-only"> approved</span>
          </p>
        )}
      </td>
      {!customer && <td className={TD}><RiskChip score={c.risk_score} /></td>}
      <td className={TD}><ClaimStatusBadge status={c.status} audience={customer ? "customer" : "handler"} /></td>
      {wide && (
        <td className={TD}>
          <Tooltip content={formatDateTime(c.updated_at)}><span className="text-caption whitespace-nowrap text-muted">{formatRelative(c.updated_at)}</span></Tooltip>
        </td>
      )}
      <td className={cn(TD, "overflow-visible pr-6 text-right")} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <RowMenu id={c.id} />
      </td>
    </Row>
  );
}, sameClaim);

/** Claims table (§10.3 D). Sticky header under the topbar; row click / Enter → detail; ↑/↓ move between rows. */
export function ClaimsTable({ items, customer, onIntent, animateRows }) {
  const wrapRef = useRef(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE_FROM));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full">
      <table className="claims-table w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col className="w-44" />
          {!customer && <col className={wide ? "w-48" : "w-36"} />}
          <col className={wide ? "w-52" : "w-36"} />
          <col />
          {wide && <col className="w-28" />}
          <col className={wide ? "w-32" : "w-28"} />
          {!customer && <col className="w-18" />}
          <col className={customer ? "w-72" : "w-38"} />
          {wide && <col className="w-26" />}
          <col className="w-12" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(TH, "pl-6")}>{wide ? "Claim ID" : "Claim · reported"}</th>
            {!customer && <th scope="col" className={TH}>Customer</th>}
            <th scope="col" className={TH}>Vehicle</th>
            <th scope="col" className={TH}>Incident</th>
            {wide && <th scope="col" className={TH}>Reported</th>}
            <th scope="col" className={cn(TH, "text-right")}>Amount</th>
            {!customer && <th scope="col" className={TH}>Risk</th>}
            <th scope="col" className={TH}>Status</th>
            {wide && <th scope="col" className={TH}>Updated</th>}
            <th scope="col" className={cn(TH, "pr-6")}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {items.map((c) => <ClaimRow key={c.id} c={c} customer={customer} wide={wide} animate={animateRows} onIntent={onIntent} />)}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
