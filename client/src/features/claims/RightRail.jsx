import { useEffect, useState } from "react";
import { CircleCheck, CircleX, Clock, Hourglass, Sparkles, StickyNote, TriangleAlert, UserRoundCog } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/ui/Avatar";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { Textarea } from "../../components/ui/Input";
import { AnimatedNumber } from "../../components/ui/AnimatedNumber";
import { cn } from "../../lib/cn";
import { formatDate, formatDateTime, formatHours, formatINR, formatRelative } from "../../lib/format";

const REC_LABEL = { approve: "Approve", approve_revised: "Approve at the AI-assessed amount", approve_total_loss: "Settle as total loss",
  escalate_siu: "Escalate to SIU", review: "Handler review", manual_review: "Manual review", reject: "Reject" };
const ROUTE = { auto: { level: "pass", label: "Auto (straight-through)" }, handler: { level: "warn", label: "Handler review" },
  SIU: { level: "fail", label: "SIU route" } };
const OPEN = new Set(["SUBMITTED", "PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION"]);

/** 2–4 plain-English sentences built only from the claim's own fields (the live summary agent arrives in Phase 5). */
export function aiSummary(c) {
  if (!c.fraud) {
    return `Filed in the app on ${formatDate(c.created_at)}: ${c.incident.label.toLowerCase()} near ${c.incident.location.text || c.city}. `
      + `${c.media.filter((m) => m.kind === "photo").length} photo(s) and ${c.documents.length} document(s) received. `
      + "The AI assessment (verification, damage, costing and risk) runs when the agent pipeline processes the claim.";
  }
  const f = c.financials;
  const parts = c.damage.items.length;
  const s1 = `${c.incident.label} on ${formatDate(c.incident.datetime)} near ${c.incident.location.text}; ${parts} damaged part${parts === 1 ? "" : "s"} assessed (${c.damage.overall_severity}).`;
  const s2 = f ? (f.total_loss_check?.is_total_loss
    ? `Assessed loss ${formatINR(f.assessed_loss)} exceeds 75% of the IDV, so it is a total loss (net ${formatINR(f.net_payable)} after salvage).`
    : `AI estimate ${formatINR(f.assessed_loss)}${f.garage_quote ? ` against a garage quote of ${formatINR(f.garage_quote)}` : ""}; net payable ${formatINR(f.net_payable)}.`) : "";
  const top = [...c.fraud.fired].sort((a, b) => b.points - a.points).slice(0, 2).map((r) => r.name);
  const s3 = top.length ? `Risk ${c.fraud.score}/100 (${c.fraud.band}), mainly ${top.join(" and ")}.` : `Risk ${c.fraud.score}/100 — no rule fired.`;
  return [s1, s2, s3].filter(Boolean).join(" ");
}

function Sla({ claim }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const target = claim.sla?.target_hours ?? 48;
  const start = new Date(claim.created_at).getTime();
  const open = OPEN.has(claim.status);
  const end = open ? now : new Date(claim.decision?.decided_at ?? claim.updated_at).getTime();
  const hours = Math.max(0, (end - start) / 3_600_000);
  const pct = hours / target;
  const tone = pct >= 1 ? "fail" : pct >= 0.8 ? "warn" : "pass";
  const bar = { pass: "bg-success", warn: "bg-warning", fail: "bg-danger" }[tone];
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-muted"><Clock size={16} aria-hidden="true" />{open ? "Time since FNOL" : "Decided in"}</span>
        <StatusFlag size="sm" level={tone} label={pct >= 1 ? "SLA breached" : pct >= 0.8 ? "SLA at risk" : "Within SLA"} />
      </div>
      <p className="num mt-1 text-lg text-text">{formatHours(hours)} <span className="text-sm font-normal text-muted">of {target} h target</span></p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(pct * 100))} aria-label="SLA used">
        <div className={cn("h-full w-full origin-left rounded-full transition-transform duration-300", bar)} style={{ transform: `scaleX(${Math.min(1, pct)})` }} />
      </div>
    </div>
  );
}

const LEVEL_ICON = { fail: CircleX, warn: TriangleAlert };

/** Right rail (§10.4 D). */
export function RightRail({ claim, flags, passed, onFlag, onAction, onAddNote, notePending }) {
  const d = claim.decision;
  const f = claim.financials;
  const people = claim.context?.people ?? {};
  const [note, setNote] = useState("");
  const groups = [["fail", "Critical"], ["warn", "Warnings"]].map(([lvl, title]) => [lvl, title, flags.filter((x) => x.level === lvl)]);
  const pending = !claim.fraud;

  return (
    <div className="flex flex-col gap-4">
      <Card compact title={<span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-tint-blue" aria-hidden="true" />AI summary</span>}>
        <p className="text-sm text-text">{aiSummary(claim)}</p>
      </Card>

      <Card compact title="Recommended decision">
        {pending || d?.ai_pending ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted"><Hourglass size={16} className="text-tint-blue" aria-hidden="true" />Waiting for the AI pipeline</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-text">{REC_LABEL[d.recommended_action] ?? d.recommended_action}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusFlag size="sm" {...(ROUTE[d.route] ?? ROUTE.handler)} />
              <span className="text-sm text-muted">{Math.round(d.confidence * 100)}% confidence</span>
            </div>
            {d.final_action && (
              <p className="text-caption text-muted">
                Decided {d.final_action.replace("_", " ")} by {people[d.decided_by] ?? "a handler"} · {formatDateTime(d.decided_at)}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card compact title="Flags">
        {pending ? <p className="text-sm text-muted">No findings yet.</p> : (
          <div className="flex flex-col gap-3">
            {groups.map(([lvl, title, list]) => list.length > 0 && (
              <div key={lvl}>
                <p className="text-caption font-semibold text-muted">{title} · {list.length}</p>
                <ul className="mt-1 flex flex-col">
                  {list.map((x, i) => {
                    const Icon = LEVEL_ICON[lvl];
                    return (
                      <li key={`${i}-${x.target}`}>
                        <button type="button" onClick={() => onFlag(x)}
                          className="flex w-full items-start gap-2 rounded-sm px-2 py-1 text-left text-sm text-text transition-colors duration-150 hover:bg-bg-muted">
                          <Icon size={16} className={cn("mt-0.5 shrink-0", lvl === "fail" ? "text-danger" : "text-warning")} aria-hidden="true" />
                          <span>{x.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="inline-flex items-center gap-2 px-2 text-sm text-success"><CircleCheck size={16} aria-hidden="true" />{passed} passed</p>
          </div>
        )}
      </Card>

      <Card compact title="Key numbers">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted">AI estimate</dt><dd className="num text-right text-text">{formatINR(f?.assessed_loss)}</dd>
          <dt className="text-muted">Garage quote</dt><dd className="num text-right text-text">{formatINR(f?.garage_quote ?? claim.garage_quote)}</dd>
          <dt className="text-muted">Net payable</dt>
          <dd className="num text-right text-lg font-semibold text-success">
            {f ? <AnimatedNumber value={f.net_payable} format={formatINR} animateKey={`net-${claim.id}`} /> : "—"}
          </dd>
          {claim.amount_approved > 0 && (<><dt className="text-muted">Approved</dt><dd className="num text-right text-text">{formatINR(claim.amount_approved)}</dd></>)}
          {claim.settlement?.paid_amount && (<><dt className="text-muted">Settled</dt><dd className="num text-right text-text">{formatINR(claim.settlement.paid_amount)}</dd></>)}
        </dl>
      </Card>

      <Card compact title="SLA"><Sla claim={claim} /></Card>

      <Card compact title="Assignee" actions={
        <Button size="sm" variant="ghost" icon={UserRoundCog} onClick={() => onAction("reassign")}
          disabledReason={claim.allowed_actions?.reassign?.allowed ? undefined : claim.allowed_actions?.reassign?.reason}>Reassign</Button>}>
        {claim.assignee ? (
          <p className="inline-flex items-center gap-2 text-sm text-text"><Avatar name={people[claim.assignee]} size="sm" />{people[claim.assignee]}</p>
        ) : <p className="text-sm text-muted">Unassigned{claim.decision?.auto ? " — decided automatically" : ""}</p>}
      </Card>

      <Card compact title={<span className="inline-flex items-center gap-2"><StickyNote size={16} aria-hidden="true" />Internal notes</span>}>
        <ul className="flex flex-col gap-3">
          {(claim.internal_notes ?? []).slice().reverse().map((n) => (
            <li key={n.id} className="text-sm">
              <p className="text-text">{n.text}</p>
              <p className="text-caption text-subtle">{people[n.author] ?? "Handler"} · {formatRelative(n.ts)}</p>
            </li>
          ))}
          {!claim.internal_notes?.length && <li className="text-sm text-muted">No notes yet.</li>}
        </ul>
        <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim().length >= 2) onAddNote(note.trim(), () => setNote("")); }}>
          <label htmlFor="rail-note" className="sr-only">Add an internal note</label>
          <Textarea id="rail-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" />
          <Button type="submit" size="sm" variant="secondary" loading={notePending} disabledReason={note.trim().length < 2 ? "Write the note first" : undefined}>Add note</Button>
        </form>
      </Card>
    </div>
  );
}
