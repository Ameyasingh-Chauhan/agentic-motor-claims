import { useState } from "react";
import { ArrowRight, Download, Lock } from "lucide-react";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ClaimStatusBadge } from "../../../components/ui/StatusFlag";
import { formatDateTime, formatINR } from "../../../lib/format";
import { ACTION_META, actorOf } from "../claimModel";

const FILTERS = [{ value: "all", label: "All" }, { value: "human", label: "People" }, { value: "agent", label: "AI agents" }, { value: "system", label: "System" }];
const OP_LABEL = { status_change: "Status change", created: "Created", file_uploaded: "File uploaded", undo: "Undo", customer_response: "Customer response" };
const STATUSES = new Set(["DRAFT", "SUBMITTED", "PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION", "APPROVED", "PREAUTH_ISSUED", "SETTLED",
  "DECLINED", "FRAUD_CONFIRMED", "WITHDRAWN"]);

function Value({ v, people }) {
  if (!v) return <span className="text-subtle">—</span>;
  if (STATUSES.has(v)) return <ClaimStatusBadge status={v} />;
  return <span className="text-text">{people[v] ?? v}</span>;
}

/** Audit Log tab (§10.4 C10): immutable, filter by actor type, CSV export (server endpoint). Never shown to customers. */
export function AuditTab({ claim }) {
  const [filter, setFilter] = useState("all");
  const people = claim.context?.people ?? {};
  const rows = [...(claim.audit ?? [])].reverse().map((e) => ({ e, actor: actorOf(e.actor, claim, people) }))
    .filter(({ actor }) => filter === "all" || (filter === "system" ? ["system", "customer"].includes(actor.kind) : actor.kind === filter));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Actor type" value={filter} onChange={setFilter} options={FILTERS} />
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-caption text-muted"><Lock size={14} aria-hidden="true" />Entries cannot be edited or deleted</span>
          <Button size="sm" variant="secondary" icon={Download} onClick={() => { window.location.href = `/api/claims/${claim.id}/export.csv`; }}>Export CSV</Button>
        </span>
      </div>
      {rows.length === 0 ? <EmptyState compact title="No entries for this filter" /> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-caption text-muted">
              <tr className="border-b border-border">{["Time", "Actor", "Action", "Before → after", "Reason"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(({ e, actor }, i) => (
                <tr key={`${e.ts}-${i}`} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap text-muted">{formatDateTime(e.ts)}</td>
                  <td className="px-3 py-2 text-text">{actor.label}<div className="text-caption text-subtle capitalize">{actor.kind === "human" ? "Person" : actor.kind}</div></td>
                  <td className="px-3 py-2 text-text">
                    {ACTION_META[e.op]?.label ?? OP_LABEL[e.op] ?? OP_LABEL[e.action] ?? e.action}
                    {e.undone && <div className="text-caption text-subtle">Reverted: {ACTION_META[e.undone]?.label ?? e.undone}</div>}
                    {e.override && <div className="mt-1"><Badge tone="warning">Overrides AI ({e.override.replaceAll("_", " ")})</Badge></div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex flex-wrap items-center gap-2"><Value v={e.from} people={people} /><ArrowRight size={14} className="text-subtle" aria-hidden="true" /><Value v={e.to} people={people} /></span>
                    {e.amount != null && <div className="num mt-1 text-caption text-muted">{formatINR(e.amount)}</div>}
                  </td>
                  <td className="max-w-md px-3 py-2 text-text">{e.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
