import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { PanelRightOpen, SearchX } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { Tabs } from "../../components/ui/Tabs";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/EmptyState";
import { ApiError } from "../../lib/api";
import { formatDateTime, formatINR } from "../../lib/format";
import { ADMIN_TABS, buildFlags } from "./claimModel";
import { useClaim, useClaimAction } from "./useClaim";
import { ClaimHeader, useBackToClaims } from "./ClaimHeader";
import { FlagsStrip } from "./FlagsStrip";
import { RightRail } from "./RightRail";
import { ActionModal } from "./ActionModal";
import { highlightEvidence } from "./highlight";
import { CustomerClaimView } from "./CustomerClaimView";
import { OverviewTab } from "./tabs/OverviewTab";
import { TimelineTab } from "./tabs/TimelineTab";
import { DamageTab } from "./tabs/DamageTab";
import { VerificationTab } from "./tabs/VerificationTab";
import { FraudTab } from "./tabs/FraudTab";
import { FinancialsTab } from "./tabs/FinancialsTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { MediaTab } from "./tabs/MediaTab";
import { CommsTab } from "./tabs/CommsTab";
import { AuditTab } from "./tabs/AuditTab";
import "./claims.css";

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading claim">
      <Skeleton className="h-44 w-full" rounded="xl" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-8"><Skeleton className="h-11 w-full" /><Skeleton className="h-96 w-full" rounded="lg" /></div>
        <div className="hidden flex-col gap-4 xl:col-span-4 xl:flex"><Skeleton className="h-40 w-full" rounded="lg" /><Skeleton className="h-56 w-full" rounded="lg" /></div>
      </div>
    </div>
  );
}

/** Friendly 404 with a search box (§10.4 F). */
function ClaimNotFound({ id }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-bg text-muted"><SearchX size={28} aria-hidden="true" /></span>
      <h1 className="text-2xl font-semibold text-text">We couldn't find that claim</h1>
      <p className="text-sm text-muted">There is no claim <span className="mono text-text">{id}</span>, or it isn't one you can view. Search by claim ID, name or registration.</p>
      <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); navigate(`/?q=${encodeURIComponent(q.trim())}`); }}>
        <label htmlFor="nf-search" className="sr-only">Search claims</label>
        <Input id="nf-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ABC-MC-2026-000241 or MH 12 AB 1234" className="flex-1" />
        <Button type="submit">Search</Button>
      </form>
      <Button variant="link" to="/">Back to all claims</Button>
    </div>
  );
}

/** Print-to-PDF claim summary (only rendered in print, claims.css). */
function PrintSummary({ claim }) {
  return (
    <section className="claim-print-only mb-6 text-sm">
      <h1 className="text-2xl font-semibold">Claim summary · {claim.id}</h1>
      <p>{claim.customer_name} · {claim.vehicle.make} {claim.vehicle.model} · {claim.registration} · status {claim.status}</p>
      <p>Incident {formatDateTime(claim.incident.datetime)} · {claim.incident.label} · {claim.incident.location.text}</p>
      <p>AI estimate {formatINR(claim.financials?.assessed_loss)} · net payable {formatINR(claim.financials?.net_payable)} · approved {formatINR(claim.amount_approved)}</p>
      <p>Printed {formatDateTime(new Date())}</p>
    </section>
  );
}

function AdminClaimView({ claim }) {
  const [, setParams] = useSearchParams();
  const [modal, setModal] = useState(null);
  const [railOpen, setRailOpen] = useState(false);
  const action = useClaimAction(claim.id);
  const back = useBackToClaims();
  const { flags, passed } = buildFlags(claim);
  const pending = !claim.fraud;

  const goTo = (tab, target) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set("tab", tab); return n; }, { replace: true });
    setRailOpen(false);
    if (target) highlightEvidence(target);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onFlag = (f) => goTo(f.tab, f.target);
  const openAction = (key) => { action.reset(); setModal(key); };
  const confirm = (body) => action.mutate(body, { onSuccess: () => setModal(null) });
  const addNote = (text, done) => action.mutate({ action: "note", text, reason: text }, { onSuccess: done });

  const rail = <RightRail claim={claim} flags={flags} passed={passed} onFlag={onFlag} onAction={openAction} onAddNote={addNote} notePending={action.isPending && action.variables?.action === "note"} />;
  const tabs = ADMIN_TABS.map((t) => ({
    ...t,
    count: t.value === "fraud" ? claim.fraud?.fired?.length : t.value === "documents" ? flags.filter((f) => f.tab === "documents").length : undefined,
    countTone: t.value === "fraud" && claim.fraud?.fired?.some((r) => r.level === "fail") ? "danger" : "neutral",
  }));

  return (
    <div className="flex flex-col gap-4">
      <PrintSummary claim={claim} />
      <ClaimHeader claim={claim} admin onAction={openAction} onBack={back} />
      <FlagsStrip flags={flags} passed={passed} pending={pending} onFlag={onFlag} />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <div className="no-print mb-2 flex justify-end xl:hidden">
            <Button size="sm" variant="secondary" icon={PanelRightOpen} onClick={() => setRailOpen(true)}>Summary & flags</Button>
          </div>
          <Tabs tabs={tabs} urlParam="tab">
            {(value) => (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={value} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {value === "overview" && <OverviewTab claim={claim} />}
                  {value === "timeline" && <TimelineTab claim={claim} />}
                  {value === "damage" && <DamageTab claim={claim} />}
                  {value === "verification" && <VerificationTab claim={claim} />}
                  {value === "fraud" && <FraudTab claim={claim} onEvidence={goTo} />}
                  {value === "financials" && <FinancialsTab claim={claim} />}
                  {value === "documents" && <DocumentsTab claim={claim} />}
                  {value === "media" && <MediaTab claim={claim} />}
                  {value === "communications" && <CommsTab claim={claim} />}
                  {value === "audit" && <AuditTab claim={claim} />}
                </motion.div>
              </AnimatePresence>
            )}
          </Tabs>
        </div>
        <aside className="no-print hidden xl:col-span-4 xl:block" aria-label="Claim summary">
          <div className="sticky top-38 max-h-[calc(100dvh-10rem)] overflow-y-auto pb-4">{rail}</div>
        </aside>
      </div>
      <Drawer open={railOpen} onClose={() => setRailOpen(false)} title="Summary & flags">{rail}</Drawer>
      {modal && (
        <ActionModal action={modal} claim={claim} people={claim.context?.people} onClose={() => setModal(null)} onConfirm={confirm}
          pending={action.isPending} error={action.error} />
      )}
    </div>
  );
}

/** Claim Detail (§10.4) at /claims/:claimId — role-shaped: handler workspace for admins, customer view for policyholders. */
export default function ClaimDetailPage() {
  const { claimId } = useParams();
  const user = useAuthStore((s) => s.user);
  const q = useClaim(claimId);
  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <ClaimNotFound id={claimId} />;
    return <ErrorState title="We couldn't load this claim" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  return user?.role === "customer" ? <CustomerClaimView claim={q.data} /> : <AdminClaimView claim={q.data} />;
}
