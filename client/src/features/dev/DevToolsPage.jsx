import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, CircleCheck, CircleX, ExternalLink, FilePlus2, FileText, Image as ImageIcon, Search } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { CopyButton } from "../../components/ui/CopyButton";
import { Skeleton } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/EmptyState";
import { api, uploadFile } from "../../lib/api";
import { formatBytes, formatDateTime } from "../../lib/format";
import { DUR, EASE } from "../../lib/motion";

const BASE = "/assets/samples/in-app-claim";

/** Bundled sample set (server/scripts/make_sample_upload_set.py): policy, incident and the files to upload. */
function useSample() {
  return useQuery({
    queryKey: ["dev", "sample-claim"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/sample.json`);
      if (!res.ok) throw new Error("Sample set not found — run python scripts/make_sample_upload_set.py");
      return res.json();
    },
    staleTime: Infinity,
  });
}

const ICON = {
  pending: <Circle size={16} className="text-subtle" aria-hidden="true" />,
  running: <Spinner size={16} label="In progress" />,
  done: <CircleCheck size={16} className="text-success" aria-hidden="true" />,
  error: <CircleX size={16} className="text-danger" aria-hidden="true" />,
};
const STATE_LABEL = { pending: "Waiting", running: "In progress", done: "Done", error: "Failed" };

function LogRow({ step }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.toggle, ease: EASE }}
      className="flex items-start gap-3 py-2"
    >
      <span className="mt-0.5 shrink-0" title={STATE_LABEL[step.state]}>{ICON[step.state]}</span>
      <span className="sr-only">{STATE_LABEL[step.state]}:</span>
      <div className="min-w-0">
        <p className="text-sm text-text">{step.label}</p>
        {step.detail && <p className={step.state === "error" ? "text-caption text-danger" : "text-caption text-muted"}>{step.detail}</p>}
      </div>
    </motion.li>
  );
}

/** Runs the real in-app filing flow (§11.6): create draft → upload each file (multipart) → submit. */
function SampleClaimCard() {
  const sample = useSample();
  const qc = useQueryClient();
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const alive = useRef(true);
  useEffect(() => {  // re-arm on (StrictMode re-)mount; only a real unmount stops state updates
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const update = (i, patch) => alive.current && setSteps((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));

  async function run() {
    const s = sample.data;
    const plan = [
      { label: `Create draft claim on policy ${s.policy_no}` },
      ...s.files.map((f) => ({ label: `Upload ${f.path} as ${f.kind === "document" ? `document (${f.slot.toUpperCase()})` : `${f.slot} photo`}` })),
      { label: "Submit claim" },
    ].map((p) => ({ ...p, state: "pending", detail: null }));
    setSteps(plan);
    setResult(null);
    setRunning(true);
    let i = 0;
    try {
      update(i, { state: "running" });
      const claim = await api("/claims", { method: "POST", body: { ...s.claim, policy_no: s.policy_no } });
      update(i, { state: "done", detail: `${claim.id} · ${claim.customer_name} · ${claim.vehicle.make} ${claim.vehicle.model}` });
      for (const f of s.files) {
        i += 1;
        update(i, { state: "running" });
        const blob = await fetch(`${BASE}/${f.path}`).then((r) => { if (!r.ok) throw new Error(`Could not load ${f.path}`); return r.blob(); });
        const file = new File([blob], f.path, { type: blob.type || "image/jpeg" });
        const item = await uploadFile(`/uploads/${claim.id}`, file, { kind: f.kind, slot: f.slot, caption: f.caption });
        const bits = [formatBytes(file.size), item.id];
        if (item.width) bits.push(`${item.width} × ${item.height} WebP`);
        if (item.exif?.captured_at) bits.push(`EXIF ${formatDateTime(item.exif.captured_at)}`);
        if (item.exif?.lat != null) bits.push("GPS ✓");
        if (item.quality) bits.push(item.quality.ok ? "quality OK" : "quality low");
        update(i, { state: "done", detail: bits.join(" · ") });
      }
      i += 1;
      update(i, { state: "running" });
      const { claim: submitted } = await api(`/claims/${claim.id}/submit`, { method: "POST" });
      update(i, { state: "done", detail: `Status ${submitted.status} · admins notified · agent pipeline attaches in Phase 5` });
      // §11.6: every page includes the new claim immediately.
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["claims"] });
      if (alive.current) setResult(submitted);
    } catch (e) {
      update(i, { state: "error", detail: e.message || "Request failed" });
    } finally {
      if (alive.current) setRunning(false);
    }
  }

  if (sample.isPending) {
    return <Card title="Sample in-app claim"><Skeleton className="h-24 w-full" /></Card>;
  }
  if (sample.isError) {
    return <Card title="Sample in-app claim"><ErrorState title="Sample set missing" error={sample.error} onRetry={() => sample.refetch()} retrying={sample.isFetching} /></Card>;
  }
  const s = sample.data;
  return (
    <Card
      title="Sample in-app claim"
      subtitle="Files a claim through the real endpoints — the same path the File a Claim wizard will use (BUILD_SPEC §11.6)."
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Policyholder</dt><dd className="truncate text-text">{s.customer_name}</dd>
          <dt className="text-muted">Policy</dt><dd className="mono truncate text-text">{s.policy_no}</dd>
          <dt className="text-muted">Vehicle</dt><dd className="truncate text-text">{s.vehicle} · <span className="mono">{s.registration}</span></dd>
          <dt className="text-muted">Incident</dt><dd className="truncate text-text">{s.claim.incident.location_text}</dd>
        </dl>
        <Button icon={FilePlus2} onClick={run} loading={running} disabledReason={running ? "A sample claim is being filed" : undefined}>
          Create sample in-app claim
        </Button>
      </div>

      <ul className="mt-6 grid grid-cols-3 gap-3" aria-label="Files that will be uploaded">
        {s.files.map((f) => (
          <li key={f.path} className="min-w-0 overflow-hidden rounded-md border border-border bg-bg-muted">
            <img src={`${BASE}/${f.path}`} alt={f.caption} loading="lazy" className="aspect-4/3 w-full object-cover" />
            <p className="flex items-center gap-1 truncate px-3 py-2 text-caption text-muted">
              {f.kind === "document" ? <FileText size={14} aria-hidden="true" /> : <ImageIcon size={14} aria-hidden="true" />}
              <span className="truncate">{f.path} · {f.kind === "document" ? f.slot.toUpperCase() : f.slot}</span>
            </p>
          </li>
        ))}
      </ul>

      {steps.length > 0 && (
        <section className="mt-6 border-t border-border pt-4" aria-live="polite" aria-label="Progress">
          <h3 className="text-sm font-semibold text-text">Progress</h3>
          <ol className="mt-2 divide-y divide-border">{steps.map((st) => <LogRow key={st.label} step={st} />)}</ol>
        </section>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.collapse, ease: EASE }}
            className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-success-bg px-4 py-3"
          >
            <CircleCheck size={18} className="text-success" aria-hidden="true" />
            <span className="text-sm text-text">Filed <span className="mono font-semibold">{result.id}</span></span>
            <CopyButton value={result.id} label="Copy claim ID" />
            <span className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Search} to={`/?q=${encodeURIComponent(result.id)}`}>Find on Home</Button>
              <Button size="sm" icon={ExternalLink} to={`/claims/${result.id}`}>Open claim</Button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function DevToolsPage() {
  return (
    <>
      <PageHeader title="Dev Tools" description="Developer utilities. Raw JSON viewer, pipeline inspector, LLM mode and demo reset arrive in Phase 5." />
      <div className="grid max-w-4xl gap-6">
        <SampleClaimCard />
      </div>
    </>
  );
}
