import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, CarFront, Search, ShieldCheck, ShieldX, UserRound } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDate, formatINR } from "../../lib/format";
import { Input, Field } from "../../components/ui/Input";
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
export function StepPolicyholder({ form, update }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const list = useQuery({ queryKey: ["wizard", "policyholders", dq], queryFn: ({ signal }) => api("/wizard/policyholders", { params: { q: dq }, signal }), placeholderData: (p) => p });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Search policyholders" hint="Name, phone, city, policy number or registration">
        {(p) => <Input {...p} icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rahul Sharma, Pune or MH 12 AB 1234" autoFocus />}
      </Field>
      {list.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" rounded="md" />)}</div>
      ) : list.isError ? (
        <ErrorState compact title="Couldn't load policyholders" error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState compact title="No policyholder matches" description="Try a phone number or a registration." />
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

/** Step 1: the policyholder's policies + live lookup by policy number or registration. */
export function StepPolicy({ form, update, admin, onPolicy }) {
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
      <section aria-labelledby="mine-h" className="flex flex-col gap-3">
        <h3 id="mine-h" className="flex items-center gap-2 text-sm font-semibold text-text"><CalendarClock size={16} aria-hidden="true" className="text-muted" />
          {admin ? `${form.customer_name ?? "Policyholder"}'s policies` : "Your policies"}</h3>
        {mine.isPending ? <Skeleton className="h-36 w-full" rounded="lg" />
          : mine.isError ? <ErrorState compact title="Couldn't load policies" error={mine.error} onRetry={() => mine.refetch()} />
          : mine.data.items.length === 0 ? <EmptyState compact title="No policies" description="There are no policies for this policyholder." />
          : mine.data.items.map((p) => <PolicyCard key={p.policy_no} policy={p} selected={form.policy_no === p.policy_no} onSelect={() => choose(p)} />)}
      </section>
    </div>
  );
}
