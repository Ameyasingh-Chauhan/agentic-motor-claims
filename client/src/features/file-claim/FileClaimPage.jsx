import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Camera, ClipboardList, FilePlus2, FlaskConical, LogOut, Mic, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../../store/authStore";
import { useSystemStatus } from "../../hooks/useSystemStatus";
import { api } from "../../lib/api";
import { formatRelative } from "../../lib/format";
import { EASE } from "../../lib/motion";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Progress } from "../../components/ui/Progress";
import { Skeleton } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/EmptyState";
import { DropdownMenu } from "../../components/ui/Popover";
import { usePersistentState } from "../../hooks/usePersistentState";
import { stepsFor, tileOf } from "./constants";
import { stepIssues, photosOf } from "./rules";
import { toPatch, useWizard } from "./useWizard";
import { useUploads, uploadingFor } from "./uploads";
import { AssistantPanel, SaveIndicator, VerticalStepper } from "./WizardChrome";
import { StepPolicy, StepPolicyholder } from "./StepPolicy";
import { StepSafety } from "./StepSafety";
import { StepIncident } from "./StepIncident";
import { StepWhenWhere } from "./StepWhenWhere";
import { StepPhotos } from "./StepPhotos";
import { StepDocuments, useRequirements } from "./StepDocuments";
import { StepReview } from "./StepReview";
import "./wizard.css";

const TITLES = {
  policyholder: ["Select the policyholder", "Admins file on behalf of a customer."],
  policy: ["Your policy & vehicle", "Choose the policy this claim is for."],
  safety: ["Safety first", "A few quick questions before the details."],
  incident: ["What happened?", "Choose the type, then type it — or just say it in your language."],
  when: ["When & where", "Tell us when and where it happened."],
  photos: ["Photos & video", "Guided capture — follow the outlines."],
  documents: ["Documents & settlement", "Your checklist is built for this claim."],
  review: ["Review & submit", "Check everything, then submit."],
};

function StartScreen({ admin, onStart, onResume }) {
  const qc = useQueryClient();
  const drafts = useQuery({ queryKey: ["wizard", "drafts"], queryFn: () => api("/wizard/drafts") });
  const discard = async (id) => {
    try { await api(`/wizard/drafts/${id}`, { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["wizard", "drafts"] }); toast.success("Draft discarded"); }
    catch (e) { toast.error(e.message || "Couldn't discard the draft"); }
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-text">{admin ? "File a claim for a policyholder" : "Report what happened"}</h2>
        <p className="mt-1 text-sm text-muted">About 5 minutes. Your progress saves automatically — you can stop and come back.</p>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[[Mic, "Say it your way", "Type, or speak in any Indian language"], [Camera, "Guided photos", "Webcam or upload, with outlines"], [ClipboardList, "Smart checklist", "Only the documents you need"]].map(([Icon, t, d]) => (
            <li key={t} className="flex items-start gap-3 rounded-md bg-bg-subtle p-3"><Icon size={18} className="mt-0.5 text-tint-blue" aria-hidden="true" /><span><span className="block text-sm font-medium text-text">{t}</span><span className="text-caption text-muted">{d}</span></span></li>
          ))}
        </ul>
        <Button className="mt-6" size="lg" icon={FilePlus2} onClick={onStart}>Start a new claim</Button>
      </section>
      <section aria-labelledby="drafts-h" className="flex flex-col gap-3">
        <h2 id="drafts-h" className="text-base font-semibold text-text">Continue a draft</h2>
        {drafts.isPending ? <Skeleton className="h-16 w-full" rounded="md" />
          : drafts.isError ? <ErrorState compact title="Couldn't load drafts" error={drafts.error} onRetry={() => drafts.refetch()} />
          : drafts.data.items.length === 0 ? <p className="text-sm text-subtle">No drafts — anything you start will be kept here.</p>
          : (
            <ul className="flex flex-col gap-2">
              {drafts.data.items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text"><span className="mono">{d.id}</span> · {d.vehicle} · {d.registration}</p>
                    <p className="text-caption text-muted">{admin ? `${d.customer_name} · ` : ""}{d.incident ?? "Incident not chosen"} · {d.photos} photo(s) · saved {formatRelative(d.updated_at)}</p>
                  </div>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => discard(d.id)} aria-label={`Discard draft ${d.id}`}>Discard</Button>
                  <Button size="sm" variant="secondary" onClick={() => onResume(d)}>Continue</Button>
                </li>
              ))}
            </ul>
          )}
      </section>
    </motion.div>
  );
}

function scenarioForm(s, base) {
  const { tile, sub } = tileOf(s.incident.type);
  return {
    ...base, scenario: s.id, customer_id: s.customer_id, customer_name: s.customer_name, policy_no: s.policy.policy_no,
    safe: s.incident.injuries ? "injured" : "yes", third_party: s.incident.third_party_involved, police: Boolean(s.fir),
    fir_number: s.fir?.number ?? "", fir_station: s.fir?.station ?? "", incident_tile: tile, accident_type: sub,
    input_mode: "text", narrative: s.incident.narrative, intake: null, ai_filled: {},
    date: s.incident.datetime.slice(0, 10), time: s.incident.datetime.slice(11, 16), city: s.incident.city,
    location_text: s.incident.location_text, road: "", lat: s.incident.lat, lng: s.incident.lng,
    settlement_mode: s.claim_type === "Theft" ? "reimbursement" : s.settlement.mode, garage_id: s.settlement.garage_id,
    garage_quote: s.garage_quote ? String(Math.round(s.garage_quote)) : "",
  };
}

/** File a Claim (§10.6) — guided wizard; submit opens the Agent Theatre. */
export default function FileClaimPage() {
  const user = useAuthStore((s) => s.user);
  const admin = user?.role === "admin";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sys = useSystemStatus();
  const w = useWizard();
  const { form, draft, draftId, update } = w;
  const steps = useMemo(() => stepsFor(admin), [admin]);
  const stepKey = w.step && steps.some((s) => s.key === w.step) ? w.step : null;
  const index = stepKey ? steps.findIndex((s) => s.key === stepKey) : -1;
  const claim = draft.data;
  const uploads = useUploads((s) => s.items);
  const uploading = uploadingFor(uploads, draftId);
  const requirements = useRequirements(draftId, claim?.updated_at).data;
  const [shown, setShown] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [pace, setPace] = usePersistentState("amc:theatre-pace", "presentation");
  const mainRef = useRef(null);

  const policies = useQuery({
    queryKey: ["wizard", "policies", admin ? form?.customer_id : "me"],
    queryFn: () => api("/wizard/policies", { params: admin ? { customer_id: form.customer_id } : {} }),
    enabled: Boolean(form) && (!admin || Boolean(form?.customer_id)),
  });
  const policy = policies.data?.items.find((p) => p.policy_no === form?.policy_no) ?? null;
  const scenarios = useQuery({ queryKey: ["wizard", "scenarios"], queryFn: () => api("/wizard/scenarios"), enabled: admin && Boolean(sys.data?.demo_mode), staleTime: Infinity });

  const ctx = { admin, claim, policy, requirements, uploading };
  const issuesFor = (key) => (form ? stepIssues(key, form, ctx) : []);
  const issues = stepKey ? issuesFor(stepKey) : [];
  const errors = shown[stepKey] ? Object.fromEntries(issues.map((i) => [i.field, i.message])) : {};
  const furthest = Math.max(form?.furthest ?? 0, index);

  useEffect(() => {
    if (form && index > (form.furthest ?? 0)) update({ furthest: index });
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => w.refreshDraft();

  const next = async () => {
    if (issues.length) {
      setShown((s) => ({ ...s, [stepKey]: true }));
      toast.error(issues[0].message);
      return;
    }
    let extra = {};
    if (stepKey === "policy" && (!draftId || claim?.policy_no !== form.policy_no)) {
      try {
        if (!draftId) extra = { draft: (await w.startDraft({ policy_no: form.policy_no })).id };
        else { await w.flush(); await api(`/claims/${draftId}`, { method: "PATCH", body: { policy_no: form.policy_no } }); refresh(); }
      } catch (e) { toast.error(e.message || "Couldn't start the claim"); return; }
    }
    if (stepKey === "review") return submit();
    w.goTo(steps[index + 1].key, extra);
  };
  const back = () => { if (index > 0) w.goTo(steps[index - 1].key); };

  const submit = async () => {
    setSubmitting(true);
    try {
      await w.flush();
      const res = await api(`/claims/${draftId}/submit`, { method: "POST", body: { pace } });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["claims"] });
      qc.invalidateQueries({ queryKey: ["wizard", "drafts"] });
      qc.removeQueries({ queryKey: ["claim", draftId] });
      navigate(`/processing/${res.claim.id}`, { state: { runId: res.run_id } });
    } catch (e) {
      const fields = e.body?.detail?.fields;
      toast.error(fields ? Object.values(fields).join(" · ") : e.message || "Submit failed");
      setSubmitting(false);
    }
  };

  const loadScenario = async (s) => {
    const nextForm = scenarioForm(s, { ...(form ?? {}) });
    let extra = {};
    try {
      if (draftId && claim?.customer_id === s.customer_id) {
        if (claim.policy_no !== s.policy.policy_no) await api(`/claims/${draftId}`, { method: "PATCH", body: { policy_no: s.policy.policy_no } });
        update(nextForm);
        await w.flush();
        refresh();
      } else {
        w.reset(nextForm);
        const c = await w.startDraft({ policy_no: s.policy.policy_no, garage_id: s.settlement.garage_id, form: nextForm });
        const saved = await api(`/claims/${c.id}`, { method: "PATCH", body: toPatch(nextForm, "photos") });
        qc.setQueryData(["claim", c.id], saved);
        extra = { draft: c.id };
      }
      qc.invalidateQueries({ queryKey: ["wizard", "policies"] });
      w.goTo("photos", extra);
      toast.success(`Loaded “${s.title}”. Text and details are filled in — now add photos and documents.`);
    } catch (e) {
      toast.error(e.message || "Couldn't load the scenario");
    }
  };

  const onKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.defaultPrevented) return;
    const t = e.target;
    if (t.closest("textarea, button, a, [role=listbox], [role=option], [role=radio], [role=combobox]")) return;
    e.preventDefault();
    next();
  };

  const exit = async () => { await w.flush(); toast.success(draftId ? "Draft saved — continue it any time from File a Claim" : "Nothing to save yet"); navigate("/"); };

  const header = (
    <PageHeader title="File a Claim" description={stepKey ? `Step ${index + 1} of ${steps.length} · ${steps[index].label}` : "Guided claim filing with AI assistance"}
      actions={(
        <div className="flex items-center gap-3">
          {admin && sys.data?.demo_mode && scenarios.data && (
            <DropdownMenu trigger={<Button variant="secondary" icon={FlaskConical}>Load a sample scenario</Button>}
              items={[{ type: "label", label: "Fills text and details — you add photos and documents" }, ...scenarios.data.map((s) => ({ label: `${s.title} · ${s.customer_name}`, onSelect: () => loadScenario(s) }))]} />
          )}
          {stepKey && <Button variant="ghost" icon={LogOut} onClick={exit}>Exit and save draft</Button>}
        </div>
      )} />
  );

  if (draftId && draft.isError) {
    return <div className="flex flex-col gap-6">{header}<ErrorState title="We couldn't open this draft" error={draft.error} onRetry={() => draft.refetch()} /></div>;
  }
  if (draftId && claim && claim.status !== "DRAFT") {
    return <div className="flex flex-col gap-6">{header}<ErrorState title="This claim has already been submitted" error={{ message: `${claim.id} is no longer a draft.` }} onRetry={() => navigate(`/processing/${claim.id}`)} /></div>;
  }
  if (!stepKey && !draftId) {
    return (
      <div className="flex flex-col gap-6">{header}
        <StartScreen admin={admin} onStart={() => { w.reset(admin ? {} : { customer_id: user?.customer_id, customer_name: user?.display_name }); w.goTo(steps[0].key); }}
          onResume={(d) => w.setParams({ draft: d.id, step: steps[Math.min(Math.max(d.step ?? 1, 1), steps.length - 1)]?.key ?? "policy" })} />
      </div>
    );
  }
  if (!form || (draftId && !claim)) {
    return <div className="flex flex-col gap-6">{header}<div className="flex gap-6" aria-busy="true"><Skeleton className="h-96 w-64" rounded="lg" /><Skeleton className="h-96 flex-1" rounded="lg" /></div></div>;
  }

  const [title, sub] = TITLES[stepKey ?? "policy"];
  const pct = Math.round(((index + (issues.length ? 0 : 1)) / steps.length) * 100);
  const nextLabel = stepKey === "review" ? "Submit claim" : "Next";
  const stepProps = { form, update, errors, admin, claim, draftId, refresh, requirements };

  return (
    <div className="flex flex-col gap-4">
      {header}
      <div className="flex items-center gap-4">
        <Progress value={pct} label="Claim progress" className="flex-1" />
        <SaveIndicator save={w.save} hasDraft={Boolean(draftId)} />
      </div>
      <div className="wz-container">
        <div className="wz-cols">
          <div className="wz-steps"><div className="wz-sticky rounded-lg border border-border bg-surface p-4 shadow-sm">
            <VerticalStepper steps={steps} current={index} furthest={furthest} issuesFor={issuesFor} onStep={(k) => w.goTo(k)} />
          </div></div>
          <main ref={mainRef} className="wz-main" onKeyDown={onKeyDown} aria-labelledby="wz-title">
            <div className="rounded-lg border border-border bg-surface shadow-sm">
              <div className="border-b border-border px-6 py-4">
                <h2 id="wz-title" className="text-xl font-semibold text-text">{title}</h2>
                <p className="text-sm text-muted">{sub}</p>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={stepKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="px-6 py-6">
                  {stepKey === "policyholder" && <StepPolicyholder {...stepProps} />}
                  {stepKey === "policy" && <StepPolicy {...stepProps} onPolicy={() => {}} />}
                  {stepKey === "safety" && <StepSafety {...stepProps} />}
                  {stepKey === "incident" && <StepIncident {...stepProps} onIntake={refresh} />}
                  {stepKey === "when" && <StepWhenWhere {...stepProps} />}
                  {stepKey === "photos" && <StepPhotos {...stepProps} />}
                  {stepKey === "documents" && <StepDocuments {...stepProps} />}
                  {stepKey === "review" && <StepReview {...stepProps} policy={policy} issuesFor={issuesFor} steps={steps} onEdit={(k) => w.goTo(k)} pace={pace} setPace={setPace} />}
                </motion.div>
              </AnimatePresence>
              <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
                <Button variant="ghost" icon={ArrowLeft} onClick={back} disabled={index === 0}>Back</Button>
                <div className="flex items-center gap-3">
                  {issues.length > 0 && shown[stepKey] && <span className="text-caption text-danger">{issues.length} item(s) to complete</span>}
                  <Button size="lg" icon={stepKey === "review" ? Send : undefined} iconRight={stepKey === "review" ? undefined : ArrowRight} onClick={next} loading={submitting}
                    disabledReason={stepKey === "review" && issues.length + steps.filter((s) => s.key !== "review" && issuesFor(s.key).length).length > 0
                      ? `Still missing: ${[...steps.filter((s) => s.key !== "review").flatMap((s) => issuesFor(s.key)), ...issues].map((x) => x.message).join("; ")}` : undefined}>
                    {nextLabel}
                  </Button>
                </div>
              </div>
            </div>
          </main>
          <div className="wz-assist">
            <AssistantPanel stepKey={stepKey} form={form} claim={claim} policy={policy} photoCount={photosOf(claim).length} docCount={claim?.documents?.length ?? 0} />
          </div>
        </div>
      </div>
    </div>
  );
}
