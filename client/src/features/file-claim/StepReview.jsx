import { motion } from "motion/react";
import { Gauge, Pencil, Rocket } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDate, formatINR } from "../../lib/format";
import { Checkbox } from "../../components/ui/Checkbox";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { ACCIDENT_TYPES, INCIDENT_TILES, LANGUAGE_NAMES } from "./constants";
import { photosOf, placeText } from "./rules";
import { staggerDelay } from "../../lib/motion";

function SummaryCard({ title, stepKey, issues, onEdit, children, index }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: staggerDelay(index), duration: 0.25 }}
      className={cn("rounded-lg border bg-surface p-4", issues.length ? "border-warning" : "border-border")} aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">{title}
          {issues.length ? <StatusFlag size="sm" level="warn" label={`${issues.length} to fix`} /> : <StatusFlag size="sm" level="pass" label="Complete" />}
        </h3>
        <button type="button" onClick={() => onEdit(stepKey)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"><Pencil size={14} aria-hidden="true" />Edit</button>
      </div>
      <div className="text-sm text-text">{children}</div>
      {issues.length > 0 && <ul className="mt-2 list-disc pl-5 text-caption text-warning">{issues.map((i) => <li key={i.message}>{i.message}</li>)}</ul>}
    </motion.section>
  );
}

const Row = ({ k, v }) => <div className="flex justify-between gap-4 py-0.5"><span className="text-muted">{k}</span><span className="min-w-0 truncate text-right" title={typeof v === "string" ? v : undefined}>{v || "—"}</span></div>;

export function StepReview({ form, update, claim, policy, issuesFor, steps, onEdit, pace, setPace, requirements }) {
  const tile = INCIDENT_TILES.find((t) => t.key === form.incident_tile);
  const sub = ACCIDENT_TYPES.find((a) => a.value === form.accident_type);
  const photos = photosOf(claim);
  const docs = claim?.documents ?? [];
  const checkSteps = steps.filter((s) => s.key !== "review");
  const complete = checkSteps.filter((s) => issuesFor(s.key).length === 0).length;
  const pct = Math.round((complete / checkSteps.length) * 100);
  const lang = form.intake?.language_label || (form.intake?.language_codes ?? []).map((c) => LANGUAGE_NAMES[c] ?? c).join(" + ");
  let i = 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 rounded-lg border border-border bg-bg-subtle p-4">
        <Gauge size={24} className="text-muted" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-text">Completeness · {pct}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Claim completeness">
            <div className="h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-standard" style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
        </div>
        <span className="num text-sm text-muted">{complete} of {checkSteps.length} steps</span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SummaryCard index={i++} title="Policy & vehicle" stepKey="policy" issues={issuesFor("policy")} onEdit={onEdit}>
          {policy ? <><Row k="Policy" v={policy.policy_no} /><Row k="Vehicle" v={`${policy.vehicle.make} ${policy.vehicle.model}`} /><Row k="Registration" v={policy.vehicle.registration} /><Row k="Valid till" v={formatDate(policy.end)} /></> : <Row k="Policy" v={form.policy_no} />}
        </SummaryCard>
        <SummaryCard index={i++} title="Safety" stepKey="safety" issues={issuesFor("safety")} onEdit={onEdit}>
          <Row k="Everyone safe" v={form.safe === "yes" ? "Yes" : form.safe === "injured" ? "Someone injured" : ""} />
          <Row k="Third party" v={form.third_party == null ? "" : form.third_party ? `Yes${form.tp.vehicle ? ` · ${form.tp.vehicle}` : ""}` : "No"} />
          <Row k="Police" v={form.police == null ? "" : form.police ? `Informed${form.fir_number ? ` · FIR ${form.fir_number}` : ""}` : "Not informed"} />
        </SummaryCard>
        <SummaryCard index={i++} title="What happened" stepKey="incident" issues={issuesFor("incident")} onEdit={onEdit}>
          <Row k="Type" v={[tile?.label, sub?.label].filter(Boolean).join(" · ")} />
          <Row k="Statement" v={form.intake ? `${form.input_mode === "voice" ? "Voice note" : "Typed"} · ${lang}` : form.narrative ? "Typed" : ""} />
          <p className="mt-1 line-clamp-3 text-muted">{form.intake?.translation_en || form.narrative}</p>
        </SummaryCard>
        <SummaryCard index={i++} title="When & where" stepKey="when" issues={issuesFor("when")} onEdit={onEdit}>
          <Row k="When" v={form.date ? `${formatDate(form.date)} · ${form.time} IST` : ""} />
          <Row k="Where" v={placeText(form.location_text, form.road, form.city)} />
        </SummaryCard>
        <SummaryCard index={i++} title="Photos" stepKey="photos" issues={issuesFor("photos")} onEdit={onEdit}>
          {photos.length ? (
            <div className="flex flex-wrap gap-2">{photos.slice(0, 8).map((m) => <img key={m.id} src={m.thumb || m.url} alt={m.caption || m.slot} className="h-14 w-20 rounded-sm object-cover" />)}</div>
          ) : <Row k="Photos" v="None yet" />}
        </SummaryCard>
        <SummaryCard index={i++} title="Documents & settlement" stepKey="documents" issues={issuesFor("documents")} onEdit={onEdit}>
          <Row k="Documents" v={`${docs.length} uploaded${requirements ? ` · ${requirements.groups.mandatory.filter((d) => d.digital).length} fetched digitally` : ""}`} />
          <Row k="Settlement" v={form.incident_tile === "theft" ? "IDV to bank" : form.settlement_mode === "cashless" ? `Cashless · ${claim?.garage_name ?? "garage not chosen"}` : form.settlement_mode === "reimbursement" ? `Reimbursement · ****${form.bank.account_last4}` : ""} />
          {Number(form.garage_quote) > 0 && <Row k="Garage estimate" v={formatINR(Number(form.garage_quote))} />}
        </SummaryCard>
      </div>
      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <Checkbox checked={form.consent} onChange={(v) => update({ consent: v })}
          label="I declare that the information given is true and complete to the best of my knowledge"
          description="I authorise ABC General Insurance to verify it with the RTO (Vahan), NPCI FASTag, IIB and the police, and to contact me on WhatsApp about this claim." />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span className="flex items-center gap-2 text-sm text-muted"><Rocket size={16} aria-hidden="true" />After you submit, watch our AI agents process the claim live.</span>
          <SegmentedControl size="sm" label="Processing pace" value={pace} onChange={setPace}
            options={[{ value: "presentation", label: "Presentation pace" }, { value: "fast", label: "Real speed" }]} />
        </div>
      </div>
    </div>
  );
}
