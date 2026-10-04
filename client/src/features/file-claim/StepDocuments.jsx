import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Building2, CloudDownload, FileText, Info, Landmark, ScanText, Star, Upload, Wrench } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Checkbox } from "../../components/ui/Checkbox";
import { Field, Input } from "../../components/ui/Input";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { Tooltip } from "../../components/ui/Tooltip";
import { useUploads } from "./uploads";

const GROUPS = [["mandatory", "Mandatory"], ["situation", "Required for your situation"], ["optional", "Optional"]];
const FIELD_LABEL = { vehicle_class: "Vehicle class", registration: "Registration", owner: "Owner", class: "Class", make_model: "Make / model", fuel: "Fuel", reg_date: "Registered", chassis5: "Chassis (last 5)",
  engine5: "Engine (last 5)", financier: "Financier", valid_to: "Valid to", holder: "Holder", number_last4: "DL (last 4)", valid_to_nt: "Valid till (non-transport)",
  valid_to_tr: "Valid till (transport)", classes: "Classes", policy_no: "Policy no.", insured: "Insured", cover: "Cover", idv: "IDV", fir_no: "FIR no.", station: "Station", date: "Date", total: "Total", garage: "Garage" };
const DOC_STATUS = { verified: ["pass", "Matches"], mismatch: ["fail", "Doesn't match"], flagged: ["warn", "Needs a clearer copy"], received: ["pending", "Received"] };

export function useRequirements(draftId, version) {
  return useQuery({ queryKey: ["wizard", "requirements", draftId, version], queryFn: ({ signal }) => api(`/wizard/requirements/${draftId}`, { signal }),
    enabled: Boolean(draftId), placeholderData: (p) => p });
}

function Extracted({ doc }) {
  const fields = Object.entries(doc.extracted ?? {}).filter(([, v]) => v != null && v !== "" && typeof v !== "object" || Array.isArray(v));
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex flex-col gap-2 rounded-md bg-bg-subtle p-3">
      {fields.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {fields.slice(0, 8).map(([k, v]) => (
            <div key={k} className="flex min-w-0 justify-between gap-2 text-caption"><dt className="text-muted">{FIELD_LABEL[k] ?? k}</dt><dd className="truncate text-text">{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>
          ))}
        </dl>
      )}
      {doc.checks?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {doc.checks.map((c, i) => <StatusFlag key={i} size="sm" level={c.level === "fail" ? "fail" : c.level === "warn" ? "warn" : "pass"} label={c.message} />)}
        </div>
      )}
    </motion.div>
  );
}

function DocItem({ item, draftId, onUploaded, reading }) {
  const input = useRef(null);
  const items = useUploads((s) => s.items);
  const pending = Object.values(items).find((i) => i.claimId === draftId && i.slot === item.doc && i.status === "uploading");
  const last = item.uploaded.at(-1);
  const status = last ? DOC_STATUS[last.status] ?? DOC_STATUS.received : null;
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <FileText size={18} className="shrink-0 text-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-text">
            {item.label}
            {item.why && <Tooltip content={item.why}><button type="button" className="text-muted" aria-label={`Why ${item.label} is needed`}><Info size={14} aria-hidden="true" /></button></Tooltip>}
          </p>
          <p className="text-caption text-muted">
            {last ? last.original_name ?? "Uploaded" : item.digital ? "We'll fetch this digitally — upload only if you want to" : item.required ? "Required" : "Optional"}
          </p>
        </div>
        {reading === last?.id ? <Badge tone="blue" icon={ScanText}>Document agent reading…</Badge>
          : status ? <StatusFlag size="sm" level={status[0]} label={status[1]} />
          : item.digital ? <Badge tone="outline" icon={CloudDownload}>Digital</Badge> : null}
        {pending ? <span className="num text-caption text-muted">Uploading {pending.progress}%</span> : (
          <Button size="sm" variant={last ? "ghost" : "secondary"} icon={Upload} onClick={() => input.current?.click()}>{last ? "Replace" : "Upload"}</Button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploaded(item, f, last); e.target.value = ""; }} />
      </div>
      {reading === last?.id && (
        <div className="mt-2 flex flex-col gap-1" aria-busy="true"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
      )}
      {last && reading !== last.id && (last.checks?.length > 0 || Object.keys(last.extracted ?? {}).length > 0) && <Extracted doc={last} />}
    </li>
  );
}

function Garages({ form, update, claim }) {
  const q = useQuery({ queryKey: ["wizard", "garages", form.city, claim?.vehicle?.type], queryFn: ({ signal }) => api("/wizard/garages", { params: { city: form.city, vehicle_type: claim?.vehicle?.type }, signal }), staleTime: 300_000 });
  if (q.isPending) return <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" rounded="md" />)}</div>;
  if (q.isError) return <ErrorState compact title="Couldn't load garages" error={q.error} onRetry={() => q.refetch()} />;
  const list = q.data.items.filter((g) => g.cashless);
  if (!list.length) return <EmptyState compact title="No network garage nearby" description="Choose reimbursement instead." />;
  return (
    <div className="flex flex-col gap-2">
      {!q.data.in_city && <p className="text-caption text-warning">No network garage in {form.city || "this city"} — showing other cities.</p>}
      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Network garages">
        {list.map((g) => {
          const sel = form.garage_id === g.id;
          return (
            <li key={g.id}>
              <button type="button" role="radio" aria-checked={sel} onClick={() => update({ garage_id: g.id })}
                className={cn("flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-150",
                  sel ? "border-primary ring-1 ring-primary" : "border-border hover:border-border-strong")}>
                <Wrench size={18} className={sel ? "text-orange-700" : "text-muted"} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{g.name}</span>
                  <span className="block text-caption text-muted">{g.type === "authorised" ? "Authorised dealer" : "Multi-brand"} · {g.city} · ~{g.distance_km} km · repairs in ~{g.avg_tat_days} days</span>
                </span>
                <span className="flex items-center gap-1 text-sm text-text"><Star size={14} className="text-warning" aria-hidden="true" />{g.rating}</span>
                <Badge tone="success">Cashless</Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StepDocuments({ form, update, claim, draftId, refresh, errors, requirements }) {
  const qc = useQueryClient();
  const { start } = useUploads();
  const [reading, setReading] = useState(null);
  const theft = form.incident_tile === "theft";
  const req = requirements;

  const onUploaded = (item, file, previous) => {
    start(draftId, file, { kind: "document", slot: item.doc, caption: item.label }, async (res, err) => {
      if (err) { toast.error(`${item.label}: ${err}`); return; }
      if (previous) await api(`/uploads/${draftId}/${previous.id}`, { method: "DELETE" }).catch(() => {});
      refresh();
      await qc.invalidateQueries({ queryKey: ["wizard", "requirements", draftId] });
      if (item.extractable) {
        setReading(res.id);
        try {
          const out = await api("/documents/extract", { method: "POST", body: { claim_id: draftId, doc_id: res.id } });
          if (out.document) {
            const fails = out.document.checks?.filter((c) => c.level === "fail").length ?? 0;
            if (fails) toast.warning(`${item.label} read — ${fails === 1 ? "1 detail doesn't" : `${fails} details don't`} match your policy. Please check you uploaded the right document.`);
            else toast.success(`${item.label} read — details match your policy`);
          }
          else toast.message(out.message);
        } catch (e) {
          toast.error(e.message || "Couldn't read the document — we'll check it during processing");
        } finally {
          setReading(null);
          qc.invalidateQueries({ queryKey: ["wizard", "requirements", draftId] });
        }
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="docs-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="docs-h" className="text-base font-semibold text-text">Document checklist</h3>
          {req?.conditions?.length > 0 && <span className="text-caption text-muted">Built for: {req.conditions.map((c) => c.replace(/_/g, " ")).join(", ")}</span>}
        </div>
        {!req ? <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" rounded="md" />)}</div> : GROUPS.map(([key, label]) => req.groups[key].length > 0 && (
          <div key={key} className="flex flex-col gap-2">
            <p className="text-caption font-semibold tracking-wide text-muted uppercase">{label}</p>
            <ul className="flex flex-col gap-2">
              {req.groups[key].map((item) => <DocItem key={item.doc} item={item} draftId={draftId} onUploaded={onUploaded} reading={reading} />)}
            </ul>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <Checkbox label="The vehicle is on a loan (hypothecated)" description="Adds the lender's NOC to the checklist" checked={form.financed} onChange={(v) => update({ financed: v })} />
          <Checkbox label="I'll provide the missing documents later" description="Your claim may be slower — we'll ask for them by WhatsApp" checked={form.docs_later} onChange={(v) => update({ docs_later: v })} />
        </div>
        {errors.documents && <p className="text-caption text-danger" role="alert">{errors.documents}</p>}
      </section>

      <section aria-labelledby="settle-h" className="flex flex-col gap-4">
        <h3 id="settle-h" className="text-base font-semibold text-text">How should we settle?</h3>
        {theft ? (
          <p className="flex items-start gap-2 rounded-md bg-bg-subtle p-3 text-sm text-text"><Landmark size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />A theft claim is settled on the insured value (IDV), paid to your bank account.</p>
        ) : (
          <SegmentedControl label="Settlement" value={form.settlement_mode} onChange={(v) => update({ settlement_mode: v })}
            options={[{ value: "cashless", label: "Cashless at a network garage", icon: Building2 }, { value: "reimbursement", label: "Reimbursement to my bank", icon: Landmark }]} />
        )}
        {errors.settlement && <p className="text-caption text-danger">{errors.settlement}</p>}
        {!theft && form.settlement_mode === "cashless" && (
          <>
            <Garages form={form} update={update} claim={claim} />
            {errors.garage && <p className="text-caption text-danger">{errors.garage}</p>}
          </>
        )}
        {(theft || form.settlement_mode === "reimbursement") && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Account holder name" required>{(p) => <Input {...p} value={form.bank.account_name} onChange={(e) => update({ bank: { ...form.bank, account_name: e.target.value } })} autoComplete="name" />}</Field>
            <Field label="Bank name">{(p) => <Input {...p} value={form.bank.bank_name} onChange={(e) => update({ bank: { ...form.bank, bank_name: e.target.value } })} />}</Field>
            <Field label="Account number — last 4 digits" hint="We never store the full number here" required>
              {(p) => <Input {...p} inputMode="numeric" maxLength={4} value={form.bank.account_last4} onChange={(e) => update({ bank: { ...form.bank, account_last4: e.target.value.replace(/\D/g, "") } })} />}
            </Field>
            <Field label="IFSC" hint="11 characters, e.g. HDFC0001234" required>
              {(p) => <Input {...p} maxLength={11} value={form.bank.ifsc} onChange={(e) => update({ bank: { ...form.bank, ifsc: e.target.value.toUpperCase() } })} />}
            </Field>
            {errors.bank && <p className="text-caption text-danger md:col-span-2">{errors.bank}</p>}
          </div>
        )}
        {!theft && (
          <Field label="Garage estimate amount, if you have one (₹, optional)" hint="Helps us compare with our assessment">
            {(p) => <Input {...p} inputMode="numeric" value={form.garage_quote} onChange={(e) => update({ garage_quote: e.target.value.replace(/[^\d]/g, "") })} placeholder="45000" className="max-w-xs" />}
          </Field>
        )}
      </section>
    </div>
  );
}
