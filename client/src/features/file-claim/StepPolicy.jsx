import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, CarFront, CircleAlert, FileUp, Loader2, Search, ShieldCheck, ShieldX, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, uploadFile } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDate, formatINR } from "../../lib/format";
import { Input, Field, Textarea } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { Badge } from "../../components/ui/Badge";
import { EASE } from "../../lib/motion";

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const ADDON_LABEL = { zero_dep: "Zero depreciation", consumables: "Consumables", engine_protect: "Engine protect", rti: "Return to invoice", rsa: "Roadside assistance" };

/** Step 0 (admins): searchable policyholder list. */
export function StepPolicyholder({ form, update, onNewPolicyholder }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const list = useQuery({ queryKey: ["wizard", "policyholders", dq], queryFn: ({ signal }) => api("/wizard/policyholders", { params: { q: dq }, signal }), placeholderData: (p) => p });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Search policyholders" hint="Name, phone, city, policy number or registration">
        {(p) => <Input {...p} icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rahul Sharma, Pune or MH 12 AB 1234" autoFocus />}
      </Field>
      {onNewPolicyholder && <Button type="button" variant="secondary" icon={FileUp} onClick={onNewPolicyholder}>New policyholder — upload policy document</Button>}
      {list.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" rounded="md" />)}</div>
      ) : list.isError ? (
        <ErrorState compact title="Couldn't load policyholders" error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState compact title="No policyholder matches" description="Not in our records? Upload their policy document to add them." action={onNewPolicyholder ? <Button type="button" variant="secondary" icon={FileUp} onClick={onNewPolicyholder}>New policyholder — upload policy document</Button> : undefined} />
      ) : (
        <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1" role="listbox" aria-label="Policyholders">
          {list.data.items.map((c) => {
            const sel = form.customer_id === c.id;
            return (
              <li key={c.id}>
                <button type="button" role="option" aria-selected={sel}
                  onClick={() => update({ customer_id: c.id, customer_name: c.name, policy_no: sel ? form.policy_no : null })}
                  className={cn("flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-150",
                    sel ? "border-primary bg-surface ring-1 ring-primary" : "border-border bg-surface hover:border-border-strong")}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint-blue-bg text-tint-blue"><UserRound size={18} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text">{c.name}</span>
                    <span className="block truncate text-caption text-muted">{c.city} · {c.phone} · {c.registrations.join(", ")}</span>
                  </span>
                  <span className="text-caption text-muted">{c.policies} {c.policies === 1 ? "policy" : "policies"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Animated policy card (insurer, cover, add-ons, validity flag, IDV, vehicle). */
export function PolicyCard({ policy, selected, onSelect, compact }) {
  const v = policy.vehicle;
  const Tag = onSelect ? "button" : "div";
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
      <Tag type={onSelect ? "button" : undefined} onClick={onSelect} aria-pressed={onSelect ? selected : undefined}
        className={cn("block w-full overflow-hidden rounded-lg border bg-surface text-left shadow-sm transition-colors duration-150",
          selected ? "border-primary ring-1 ring-primary" : "border-border", onSelect && !selected && "hover:border-border-strong",
          policy.expired && "opacity-90")}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {policy.expired ? <ShieldX size={18} className="shrink-0 text-danger" aria-hidden="true" /> : <ShieldCheck size={18} className="shrink-0 text-success" aria-hidden="true" />}
            <span className="truncate text-sm font-semibold text-text">{policy.insurer}</span>
            <span className="mono truncate text-caption text-muted">{policy.policy_no}</span>
          </div>
          {policy.expired ? <StatusFlag size="sm" level="fail" label={`Expired ${formatDate(policy.end)}`} />
            : <StatusFlag size="sm" level={policy.days_left < 30 ? "warn" : "pass"} label={`Valid till ${formatDate(policy.end)}`} />}
        </div>
        <div className={cn("grid gap-4 px-4 py-3", compact ? "grid-cols-2" : "grid-cols-[auto_1fr_auto]")}>
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-bg-subtle text-muted"><CarFront size={24} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-text">{v.make} {v.model} <span className="font-normal text-muted">{v.variant}</span></p>
            <p className="mono text-sm text-text">{v.registration}</p>
            <p className="text-caption text-muted">{v.colour} · {v.fuel} · {policy.product} · {policy.cover}</p>
          </div>
          <div className="text-right">
            <p className="text-caption text-muted">IDV</p>
            <p className="num text-base font-semibold text-text">{formatINR(policy.idv)}</p>
            {policy.ncb_pct ? <p className="text-caption text-muted">NCB {policy.ncb_pct}%</p> : null}
          </div>
        </div>
        {(policy.add_ons.length > 0 || policy.expired) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            {policy.add_ons.map((a) => <Badge key={a} tone="outline">{ADDON_LABEL[a] ?? a}</Badge>)}
            {policy.expired && <span className="text-caption text-danger">This policy ended on {formatDate(policy.end)}. Renew it or choose another policy to claim.</span>}
          </div>
        )}
      </Tag>
    </motion.div>
  );
}

const POLICY_FIELDS = [
  { group: "Policyholder", key: "insured", label: "Insured name", required: true },
  { group: "Policyholder", key: "insured_father", label: "Father's / husband's name" },
  { group: "Policyholder", key: "insured_address", label: "Address", textarea: true },
  { group: "Policyholder", key: "insured_contact", label: "Contact number" },
  { group: "Policy", key: "policy_no", label: "Policy number", required: true },
  { group: "Policy", key: "period_from", label: "Cover from (YYYY-MM-DD)" },
  { group: "Policy", key: "period_to", label: "Cover to (YYYY-MM-DD)" },
  { group: "Policy", key: "cover", label: "Cover", options: ["OD+TP", "TP"] },
  { group: "Policy", key: "idv", label: "IDV (₹)", number: true },
  { group: "Policy", key: "ncb_pct", label: "NCB (%)", number: true },
  { group: "Policy", key: "add_ons", label: "Add-ons (comma separated)", list: true },
  { group: "Policy", key: "deductible_compulsory", label: "Compulsory deductible (₹)", number: true },
  { group: "Policy", key: "deductible_voluntary", label: "Voluntary deductible (₹)", number: true },
  { group: "Policy", key: "premium", label: "Premium paid (₹)", number: true },
  { group: "Vehicle", key: "registration", label: "Registration number", required: true, hint: "Not read automatically from most policy schedules — type it in" },
  { group: "Vehicle", key: "vehicle_make", label: "Make" },
  { group: "Vehicle", key: "vehicle_model", label: "Model" },
  { group: "Vehicle", key: "vehicle_variant", label: "Variant" },
  { group: "Vehicle", key: "vehicle_colour", label: "Colour" },
  { group: "Vehicle", key: "fuel", label: "Fuel" },
  { group: "Vehicle", key: "vehicle_cc", label: "Engine (cc)", number: true },
  { group: "Vehicle", key: "vehicle_year", label: "Year" },
  { group: "Vehicle", key: "chassis5", label: "Chassis no. (last 5)" },
  { group: "Vehicle", key: "engine5", label: "Engine no. (last 5)" },
];

/** One editable field with a confidence badge (amber below 0.75, per the extraction confidence). */
function ExtractedField({ meta, value, confidence, onChange }) {
  const text = Array.isArray(value) ? value.join(", ") : (value ?? "");
  // A confidence score only means something next to the value it scores — an empty field (the model reported a
  // confidence without actually extracting the text, which happens occasionally) reads as "not read automatically".
  const hasConfidence = confidence != null && text !== "";
  const low = hasConfidence && confidence < 0.75;
  const missing = meta.required && !text;
  return (
    <Field label={meta.label} required={meta.required}>
      {(p) => (
        <div className="flex flex-col gap-1">
          {meta.options ? (
            <Select {...p} value={text || null} onChange={(v) => onChange(v)} placeholder="Select…" options={meta.options.map((o) => ({ value: o, label: o }))} />
          ) : meta.textarea ? (
            <Textarea {...p} rows={2} value={text} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <Input {...p} type={meta.number ? "number" : "text"} value={text}
              onChange={(e) => onChange(meta.number ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
          )}
          {hasConfidence ? (
            <span className={cn("inline-flex items-center gap-1 text-caption", low ? "text-warning" : "text-subtle")}>
              {low && <CircleAlert size={12} aria-hidden="true" />}{Math.round(confidence * 100)}% confidence{low ? " — please check this" : ""}
            </span>
          ) : (
            <span className={cn("inline-flex items-center gap-1 text-caption", missing ? "text-danger" : "text-subtle")}>
              {missing && <CircleAlert size={12} aria-hidden="true" />}{meta.hint ?? (missing ? "Required — enter it" : "Not read automatically — enter it")}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}

/** Upload-a-document fallback for Step 1 (Feature A): reads the Document agent's extraction into an editable card,
 * then creates the customer/vehicle/policy and a new draft claim from it on Confirm. */
export function PolicyUploadCard({ onClaimCreated, onUsePolicy, prominent }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | reading | ready | confirming
  const [fields, setFields] = useState({});
  const [confidence, setConfidence] = useState({});
  const [staging, setStaging] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [error, setError] = useState(null);

  const pick = () => inputRef.current?.click();
  const setField = (key, value) => setFields((f) => ({ ...f, [key]: value }));

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStatus("reading");
    setError(null);
    setDuplicate(null);
    try {
      const out = await uploadFile("/wizard/policy-document", file);
      setFileName(file.name);
      setStaging(out.staging ?? null);
      setFields(out.extracted ?? {});
      setConfidence(out.field_confidence ?? {});
      setStatus("ready");
      if (out.message) toast.info(out.message);
    } catch (err) {
      setError(err.message || "Couldn't read the file");
      setStatus("idle");
    }
  };

  const confirm = async () => {
    setStatus("confirming");
    setError(null);
    try {
      const body = { staging, fields: { ...fields, add_ons: typeof fields.add_ons === "string" ? fields.add_ons.split(",").map((s) => s.trim()).filter(Boolean) : fields.add_ons } };
      const out = await api("/wizard/policy-document/confirm", { method: "POST", body });
      (out.warnings ?? []).forEach((w) => toast.warning(w));
      onClaimCreated(out.claim);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDuplicate(err.body?.detail?.policy ?? null);
        setError(err.body?.detail?.message || err.message);
      } else {
        const fields = err.body?.detail?.fields;
        setError(fields ? Object.values(fields).join(" · ") : err.message || "Couldn't create the claim");
      }
      setStatus("ready");
    }
  };

  const fileInput = <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />;

  if (status === "idle") {
    return (
      <div className={cn("rounded-lg border p-4", prominent ? "border-border bg-surface" : "border-dashed border-border bg-bg-subtle")}>
        {fileInput}
        <Button variant={prominent ? "primary" : "secondary"} icon={FileUp} onClick={pick}>
          {prominent ? "Upload your policy document" : "Or upload your policy document instead"}
        </Button>
        <p className="mt-2 text-caption text-subtle">A photo, scan or PDF of your policy schedule. We'll read it and fill in the details — you can edit anything before continuing.</p>
        {error && <p className="mt-2 flex items-center gap-1 text-caption text-danger"><CircleAlert size={14} aria-hidden="true" />{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      {fileInput}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-text">
          <Sparkles size={16} className="text-tint-blue" aria-hidden="true" /> Extracted policy{fileName ? ` from “${fileName}”` : ""}
        </span>
        <Button size="sm" variant="ghost" onClick={pick} disabled={status === "reading" || status === "confirming"}>Upload a different file</Button>
      </div>
      {status === "reading" && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Reading the document…</div>}
      {error && <div className="flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</div>}
      {duplicate && (
        <div className="rounded-lg border border-border bg-bg-subtle p-3">
          <p className="mb-2 text-sm text-text">Use the existing policy instead:</p>
          <PolicyCard policy={duplicate} onSelect={() => onUsePolicy(duplicate)} />
        </div>
      )}
      {(status === "ready" || status === "confirming") && !duplicate && (
        <>
          {["Policyholder", "Policy", "Vehicle"].map((group) => (
            <fieldset key={group} className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold text-text">{group}</legend>
              <div className="grid gap-3 md:grid-cols-2">
                {POLICY_FIELDS.filter((meta) => meta.group === group).map((meta) => (
                  <ExtractedField key={meta.key} meta={meta} value={fields[meta.key]} confidence={confidence[meta.key]}
                    onChange={(v) => setField(meta.key, v)} />
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex justify-end">
            <Button onClick={confirm} loading={status === "confirming"}>Confirm & continue</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Step 1: the policyholder's policies + live lookup by policy number or registration. */
export function StepPolicy({ form, update, admin, onPolicy, onUploaded }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 350);
  const mine = useQuery({
    queryKey: ["wizard", "policies", form.customer_id ?? "me"],
    queryFn: ({ signal }) => api("/wizard/policies", { params: admin ? { customer_id: form.customer_id } : {}, signal }),
    enabled: !admin || Boolean(form.customer_id),
  });
  const look = useQuery({
    queryKey: ["wizard", "lookup", dq],
    queryFn: ({ signal }) => api("/wizard/lookup", { params: { q: dq }, signal }),
    enabled: dq.replace(/\s/g, "").length >= 4,
    retry: false,
  });
  const choose = (p) => { update({ policy_no: p.policy_no, customer_id: p.customer_id, customer_name: p.customer_name }); onPolicy(p); };
  useEffect(() => {
    if (mine.data && form.policy_no) { const p = mine.data.items.find((x) => x.policy_no === form.policy_no); if (p) onPolicy(p); }
  }, [mine.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const notFound = look.isError && look.error instanceof ApiError && look.error.status === 404;
  return (
    <div className="flex flex-col gap-6">
      <Field label="Policy number or registration" hint="We look it up as you type">
        {(p) => <Input {...p} icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ABC/PC/2026/188297 or MH 12 AB 1234" autoComplete="off" />}
      </Field>
      <AnimatePresence mode="popLayout">
        {dq.replace(/\s/g, "").length >= 4 && (
          <motion.div key={dq} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} aria-live="polite">
            {look.isFetching && !look.data ? <Skeleton className="h-36 w-full" rounded="lg" />
              : notFound ? (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-subtle p-4">
                  <StatusFlag level="fail" label="Not found" size="sm" />
                  <p className="text-sm text-text">No {admin ? "" : "matching "}policy for “{dq}”. Check the number on your policy document, or choose from {admin ? "the list" : "your policies"} below.</p>
                </div>
              ) : look.isError ? <ErrorState compact title="Lookup failed" error={look.error} onRetry={() => look.refetch()} />
              : look.data ? <PolicyCard policy={look.data} selected={form.policy_no === look.data.policy_no} onSelect={() => choose(look.data)} /> : null}
          </motion.div>
        )}
      </AnimatePresence>
      {notFound && <PolicyUploadCard prominent onClaimCreated={onUploaded} onUsePolicy={choose} />}
      {(!admin || Boolean(form.customer_id)) && (
        <section aria-labelledby="mine-h" className="flex flex-col gap-3">
          <h3 id="mine-h" className="flex items-center gap-2 text-sm font-semibold text-text"><CalendarClock size={16} aria-hidden="true" className="text-muted" />
            {admin ? `${form.customer_name ?? "Policyholder"}'s policies` : "Your policies"}</h3>
          {mine.isPending ? <Skeleton className="h-36 w-full" rounded="lg" />
            : mine.isError ? <ErrorState compact title="Couldn't load policies" error={mine.error} onRetry={() => mine.refetch()} />
            : mine.data.items.length === 0 ? <EmptyState compact title="No policies" description="There are no policies for this policyholder." />
            : mine.data.items.map((p) => <PolicyCard key={p.policy_no} policy={p} selected={form.policy_no === p.policy_no} onSelect={() => choose(p)} />)}
        </section>
      )}
      {!notFound && <PolicyUploadCard onClaimCreated={onUploaded} onUsePolicy={choose} />}
    </div>
  );
}
