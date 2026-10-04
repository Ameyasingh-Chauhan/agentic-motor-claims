import { useState } from "react";
import { motion } from "motion/react";
import { BadgeCheck, Bot, Download, Eye, Home, MessageCircle, MessageSquareReply, SearchCheck, Wrench } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDate, formatINR } from "../../lib/format";
import { EASE } from "../../lib/motion";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CopyButton } from "../../components/ui/CopyButton";
import { Stepper } from "../../components/ui/Stepper";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { AdminClaimView } from "../claims/ClaimDetailPage";
import { RespondModal } from "../claims/CustomerClaimView";
import { ROUTE_TEXT, ROUTE_TONE } from "./theatreModel";

/** §12.9: rupee values are shown rounded half-up to the nearest ₹10 (the server keeps exact values), so the rows add up. */
const display10 = (v) => (v == null ? v : Math.round(v / 10) * 10);

const TONE_CLS = { success: "border-success bg-success-bg text-success", warning: "border-warning bg-warning-bg text-warning", danger: "border-danger bg-danger-bg text-danger" };
const LEVEL = { success: "pass", warning: "warn", danger: "fail" };

/** Decision banner (green / amber / red, always with an icon and a label). */
export function DecisionBanner({ claim, seconds }) {
  const route = claim.decision?.route;
  const tone = ROUTE_TONE[route] ?? "warning";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}
      className={cn("flex flex-wrap items-center gap-4 rounded-lg border px-4 py-3", TONE_CLS[tone])} role="status">
      <Bot size={22} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Processed by AI in {seconds != null ? `${seconds} s` : "—"}</p>
        <p className="text-sm text-text">{ROUTE_TEXT[route] ?? "Decision recorded"} · {claim.decision?.reasons?.[0] ?? ""}</p>
      </div>
      <StatusFlag level={LEVEL[tone]} label={route === "auto" ? "Auto-decided" : route === "SIU" ? "SIU referral" : "Handler review"} />
      {claim.llm_mode === "demo" && <StatusFlag level="warn" label="Demo mode" />}
    </motion.div>
  );
}

/** Handler result (§10.8): the Claim Detail page for this claim, under the AI banner. */
export function HandlerResult({ claim, seconds }) {
  return (
    <div className="flex flex-col gap-4">
      <DecisionBanner claim={claim} seconds={seconds} />
      <AdminClaimView claim={claim} />
    </div>
  );
}

function addDays(iso, d) {
  const t = new Date(iso);
  t.setDate(t.getDate() + d);
  return t.toISOString();
}

const OP = { replace: "needs replacement", repair: "needs repair", repair_paint: "needs repair and paint", paint: "needs repainting", refinish: "needs repainting" };

/** Customer result (§10.8): friendly confirmation — what we found, the estimate, what you may pay, next steps. Never fraud or scores. */
export function CustomerResult({ claim }) {
  const [respond, setRespond] = useState(false);
  const s = claim.status;
  const approved = ["APPROVED", "PREAUTH_ISSUED"].includes(s);
  const verify = ["UNDER_REVIEW", "INFO_REQUESTED"].includes(s);
  const fin = claim.financials;
  const garage = claim.context?.garage;
  const cashless = claim.settlement?.mode === "cashless";
  const items = (claim.damage?.items ?? []).slice(0, 5);
  const pay = fin ? (fin.compulsory_deductible ?? 0) + (fin.voluntary_deductible ?? 0) : null;
  const steps = cashless
    ? [{ key: "g", label: "Garage", description: formatDate(addDays(claim.created_at, 1)) }, { key: "s", label: "Survey", description: formatDate(addDays(claim.created_at, 1)) },
      { key: "r", label: "Repair", description: formatDate(addDays(claim.created_at, 1 + (garage?.avg_tat_days ?? 5))) }, { key: "p", label: "Collect your vehicle", description: formatDate(addDays(claim.created_at, 2 + (garage?.avg_tat_days ?? 5))) }]
    : [{ key: "s", label: "Survey", description: formatDate(addDays(claim.created_at, 1)) }, { key: "d", label: "Decision", description: formatDate(addDays(claim.created_at, 2)) },
      { key: "r", label: "Repair or replacement", description: "At a garage you choose" }, { key: "p", label: "Payment to your bank", description: formatDate(addDays(claim.created_at, 7)) }];
  const Illus = approved ? BadgeCheck : SearchCheck;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
        className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-8 text-center shadow-sm">
        <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
          className={cn("flex h-20 w-20 items-center justify-center rounded-full", approved ? "bg-success-bg text-success" : "bg-tint-blue-bg text-tint-blue")}>
          <Illus size={40} aria-hidden="true" />
        </motion.span>
        <h1 className="text-2xl font-semibold text-text">
          {approved ? (s === "PREAUTH_ISSUED" ? "Your cashless repair is pre-approved" : "Your claim is approved") : verify ? "We've received your claim" : "Thanks — your claim is in"}
        </h1>
        <p className="max-w-xl text-sm text-muted">
          {approved ? "Everything checked out. Here's what happens next."
            : verify ? "We need to verify a few details — our team will contact you within 24 hours." : "We'll keep you updated at every step."}
        </p>
        <div className="flex items-center gap-2 rounded-md bg-bg-subtle px-3 py-2">
          <span className="text-caption text-muted">Claim number</span><span className="mono text-sm font-semibold text-text">{claim.id}</span><CopyButton value={claim.id} label="Copy claim number" />
        </div>
        {s === "INFO_REQUESTED" && <Button icon={MessageSquareReply} onClick={() => setRespond(true)}>Send what we asked for</Button>}
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card compact title="What we found">
          {items.length ? (
            <ul className="flex flex-col gap-2 text-sm text-text">
              {items.map((i) => <li key={i.part_code ?? i.part} className="flex items-start gap-2"><Wrench size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />{i.part} {OP[i.operation] ?? `— ${String(i.operation ?? "").replace(/_/g, " ")}`}</li>)}
            </ul>
          ) : <p className="text-sm text-muted">{claim.claim_type === "Theft" ? "Your theft claim is settled on the insured value of the vehicle." : "Our surveyor will confirm the damage during the inspection."}</p>}
        </Card>
        <Card compact title="Estimate">
          {fin ? (
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">Estimated repair cost</dt><dd className="num font-semibold text-text">{formatINR(display10(fin.assessed_loss))}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">What you may pay (deductible)</dt><dd className="num text-text">{formatINR(display10(pay))}</dd></div>
              <div className="flex justify-between gap-4 border-t border-border pt-2"><dt className="text-muted">ABC pays{approved ? "" : " if approved"}</dt><dd className="num font-semibold text-text">{formatINR(fin.display_net_payable ?? fin.net_payable)}</dd></div>
              <p className="text-caption text-subtle">Estimates — the final amount is confirmed after the survey.</p>
            </dl>
          ) : <p className="text-sm text-muted">We'll share the estimate after the inspection.</p>}
        </Card>
      </div>

      <Card compact title="Next steps">
        <Stepper steps={steps} current={approved ? 1 : 0} />
      </Card>

      {garage && cashless && (
        <Card compact title="Your garage">
          <p className="font-semibold text-text">{garage.name}</p>
          <p className="text-sm text-muted">{garage.city} · {garage.contact} · repairs in about {garage.avg_tat_days} days</p>
        </Card>
      )}

      <p className="flex items-center justify-center gap-2 text-sm text-muted"><MessageCircle size={16} aria-hidden="true" />We've sent these details to your WhatsApp.</p>
      <div className="no-print flex flex-wrap justify-center gap-3">
        <Button icon={Eye} to={`/claims/${claim.id}`}>View claim</Button>
        <Button variant="secondary" icon={Download} onClick={() => window.print()}>Download summary</Button>
        <Button variant="ghost" icon={Home} to="/">Go to Home</Button>
      </div>
      {respond && <RespondModal claim={claim} onClose={() => setRespond(false)} />}
    </div>
  );
}
