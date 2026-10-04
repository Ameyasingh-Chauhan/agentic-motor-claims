import { useState } from "react";
import { Link } from "react-router";
import { Car, IdCard, MapPin, ShieldCheck, Sparkles, Store, UserRound } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { StatusFlag, ClaimStatusBadge } from "../../../components/ui/StatusFlag";
import { Badge } from "../../../components/ui/Badge";
import { Avatar } from "../../../components/ui/Avatar";
import { formatDate, formatDateTime, formatINR } from "../../../lib/format";
import { ClampText, KV, Photo } from "../parts";

export const LANGUAGE = { en: "English", hi: "Hindi", "hi-en": "Hindi–English mix", mr: "Marathi", ml: "Malayalam", ta: "Tamil", te: "Telugu",
  kn: "Kannada", bn: "Bengali", gu: "Gujarati", or: "Odia" };
const ADD_ONS = { zero_dep: "Zero depreciation", consumables: "Consumables", engine_protect: "Engine protect", rti: "Return to invoice", rsa: "Roadside assistance" };
const REC = { approve: "Approve", approve_revised: "Approve at the AI-assessed amount", approve_total_loss: "Settle as total loss", escalate_siu: "Escalate to SIU",
  review: "Handler review", manual_review: "Manual review" };

function title(icon, text) {
  const Icon = icon;
  return <span className="inline-flex items-center gap-2"><Icon size={18} className="text-subtle" aria-hidden="true" />{text}</span>;
}

function months(from, to) {
  const a = new Date(from), b = new Date(to);
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth());
}

function IncidentCard({ claim }) {
  const inc = claim.incident;
  const [original, setOriginal] = useState(false);
  const differs = Boolean(inc.narrative_original) && inc.narrative_original !== inc.narrative_en;
  const translated = differs && inc.narrative_language !== "en";
  return (
    <Card compact title={title(MapPin, "Incident")} className="lg:col-span-2">
      <div className="grid gap-6 md:grid-cols-2">
        <KV rows={[
          ["Type", inc.label], ["When", formatDateTime(inc.datetime)], ["Where", `${inc.location.text || "—"}${inc.location.city ? `, ${inc.location.city}` : ""}`],
          ["Cause", inc.cause], ["Third party", inc.third_party_involved ? "Involved" : "None"], ["Injuries", inc.injuries ? "Reported" : "None reported"],
          inc.fir ? ["FIR", `${inc.fir.number} · ${inc.fir.station}`] : null,
          ["Reported", formatDateTime(inc.reported_at)],
        ]} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-text">Customer's account</p>
            <Badge tone="blue">{LANGUAGE[inc.narrative_language] ?? inc.narrative_language}</Badge>
            {differs && (
              <button type="button" onClick={() => setOriginal((v) => !v)} className="text-caption font-medium text-blue-600 hover:underline">
                {original ? (translated ? "Show English" : "Show summary") : (translated ? "Show original" : "Show the customer's own words")}
              </button>
            )}
          </div>
          <ClampText className="mt-2">{(original ? inc.narrative_original : inc.narrative_en) || "No description yet."}</ClampText>
          {translated && !original && <p className="mt-1 text-caption text-subtle">Translated from {LANGUAGE[inc.narrative_language] ?? "the original"} by the Intake agent</p>}
        </div>
      </div>
    </Card>
  );
}

function PolicyCard({ claim, policy }) {
  if (!policy) return <Card compact title={title(ShieldCheck, "Policy")}><p className="text-sm text-muted">Policy record not found.</p></Card>;
  const at = claim.incident.datetime.slice(0, 10);
  const valid = policy.start <= at && at <= policy.end && policy.status !== "lapsed";
  const addOns = Object.entries(policy.add_ons ?? {}).filter(([, v]) => v).map(([k]) => ADD_ONS[k] ?? k);
  return (
    <Card compact title={title(ShieldCheck, "Policy")} actions={<StatusFlag size="sm" level={valid ? "pass" : "fail"} label={valid ? "Valid on incident date" : "Not valid on incident date"} />}>
      <KV rows={[
        ["Policy no.", <span key="p" className="mono">{policy.policy_no}</span>], ["Product", policy.product], ["Cover", policy.cover],
        ["Validity", `${formatDate(policy.start)} – ${formatDate(policy.end)}`], ["IDV", formatINR(policy.idv)], ["NCB", `${policy.ncb_pct}%`],
        policy.voluntary_deductible != null ? ["Voluntary deductible", formatINR(policy.voluntary_deductible)] : null,
      ]} />
      <div className="mt-3 flex flex-wrap gap-2">
        {addOns.length ? addOns.map((a) => <Badge key={a} tone="outline">{a}</Badge>) : <span className="text-caption text-subtle">No add-ons</span>}
      </div>
    </Card>
  );
}

function VehicleCard({ claim, vehicle, vahan, admin }) {
  const v = vehicle ?? {};
  return (
    <Card compact title={title(Car, "Vehicle")}>
      <div className="flex gap-4">
        <Photo src={claim.vehicle.thumb} blur={claim.vehicle.blur_data} alt={`${claim.vehicle.make} ${claim.vehicle.model}`} className="h-20 w-28 shrink-0 rounded-md" imgClassName="object-cover" />
        <div className="min-w-0">
          <p className="font-semibold text-text">{claim.vehicle.make} {claim.vehicle.model} {v.variant ?? ""}</p>
          <p className="mono text-sm text-muted">{claim.registration}</p>
          <p className="text-caption text-subtle">{[v.fuel, v.cc ? `${v.cc} cc` : null, claim.vehicle.colour].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <KV className="mt-4" rows={[
        ["Registered", v.registered_on ? `${formatDate(v.registered_on)} · ${months(v.registered_on, claim.incident.datetime)} months old` : null],
        admin && vahan ? ["RC owner (Vahan)", vahan.owner] : null,
        admin && vahan ? ["RC status", <StatusFlag key="rc" size="sm" level={vahan.rc_status === "active" && !vahan.blacklisted && !vahan.stolen ? "pass" : "fail"}
          label={vahan.stolen ? "Reported stolen" : vahan.blacklisted ? "Blacklisted" : vahan.rc_status === "active" ? "Active" : vahan.rc_status} />] : null,
        admin && vahan ? ["Hypothecation", vahan.hypothecation ?? "None"] : null,
        ["Use", v.use ? v.use[0].toUpperCase() + v.use.slice(1) : null],
      ]} />
    </Card>
  );
}

function CustomerCard({ claim, customer }) {
  if (!customer) return null;
  const prior = customer.prior_claims ?? [];
  return (
    <Card compact title={title(UserRound, "Customer")}>
      <div className="flex items-center gap-3">
        <Avatar name={customer.name} />
        <div><p className="font-semibold text-text">{customer.name}</p><p className="text-caption text-muted">{customer.city}, {customer.state}</p></div>
      </div>
      <KV className="mt-4" rows={[["Phone", customer.phone], ["Email", customer.email], ["Address", customer.address],
        ["Preferred language", LANGUAGE[customer.preferred_language] ?? customer.preferred_language]]} />
      <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
        <span className="inline-flex items-center gap-2 text-sm text-text"><IdCard size={16} className="text-subtle" aria-hidden="true" />
          <span>Aadhaar <span className="mono">{customer.kyc?.aadhaar}</span> · PAN <span className="mono">{customer.kyc?.pan}</span></span></span>
        <StatusFlag size="sm" level={customer.kyc?.verified ? "pass" : "warn"} label={customer.kyc?.verified ? "KYC verified" : "KYC pending"} />
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-text">Prior claims · {prior.length}</p>
        {prior.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {prior.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to={`/claims/${p.id}`} className="mono text-blue-600 hover:underline">{p.id}</Link>
                <span className="text-caption text-muted">{p.claim_type} · {formatDate(p.created_at)}</span>
                <ClaimStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-caption text-subtle">First claim with ABC</p>}
      </div>
    </Card>
  );
}

function GarageCard({ claim, garage }) {
  return (
    <Card compact title={title(Store, "Garage")}>
      {garage ? (
        <>
          <p className="font-semibold text-text">{garage.name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusFlag size="sm" level={garage.cashless ? "pass" : "warn"} label={garage.cashless ? "Network · cashless" : "Non-network · reimbursement"} />
            <Badge tone="outline">{garage.type === "authorised" ? "Authorised dealer" : "Multi-brand"}</Badge>
          </div>
          <KV className="mt-3" rows={[["City", `${garage.city} (tier ${garage.tier ?? "—"})`], garage.rating ? ["Rating", `${garage.rating} / 5`] : null,
            ["Average repair time", garage.avg_tat_days ? `${garage.avg_tat_days} days` : null], ["Contact", garage.contact],
            ["Settlement", claim.settlement?.mode === "cashless" ? "Cashless" : "Reimbursement"]]} />
        </>
      ) : <p className="text-sm text-muted">{claim.garage_name ?? "No garage chosen yet."}</p>}
    </Card>
  );
}

function DecisionCard({ claim }) {
  const d = claim.decision;
  return (
    <Card compact title={title(Sparkles, "AI decision summary")}>
      {!claim.fraud || d?.ai_pending ? <p className="text-sm text-muted">The Adjudication agent's recommendation appears once the pipeline has run.</p> : (
        <>
          <p className="text-lg font-semibold text-text">{REC[d.recommended_action] ?? d.recommended_action}</p>
          <p className="text-sm text-muted">{Math.round(d.confidence * 100)}% confidence · route {d.route}</p>
          <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm text-text">
            {(d.reasons ?? []).slice(0, 3).map((r) => <li key={r}>{r}</li>)}
          </ol>
        </>
      )}
    </Card>
  );
}

/** Overview tab (§10.4 C1). Customers get plain-language cards only (no Vahan, KYC numbers, prior claims or AI decision). */
export function OverviewTab({ claim, admin = true }) {
  const ctx = claim.context ?? {};
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <IncidentCard claim={claim} />
      <PolicyCard claim={claim} policy={ctx.policy} />
      <VehicleCard claim={claim} vehicle={ctx.vehicle} vahan={ctx.vahan} admin={admin} />
      {admin && <CustomerCard claim={claim} customer={ctx.customer} />}
      <GarageCard claim={claim} garage={ctx.garage} />
      {admin && <DecisionCard claim={claim} />}
      {!admin && (
        <Card compact title={title(Sparkles, "Your claim amount")}>
          <KV rows={[["Claimed", formatINR(claim.amount_claimed)], ["Approved", claim.amount_approved ? formatINR(claim.amount_approved) : "Not decided yet"],
            claim.settlement?.paid_amount ? ["Paid", `${formatINR(claim.settlement.paid_amount)} · ref ${claim.settlement.payment_reference}`] : null]} />
        </Card>
      )}
    </div>
  );
}
