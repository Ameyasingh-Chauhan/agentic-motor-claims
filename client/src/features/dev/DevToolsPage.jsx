import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Circle, CircleCheck, CircleX, ExternalLink, FilePlus2, FileText, Image as ImageIcon, PlayCircle, PlugZap, RotateCcw, Search, TriangleAlert,
} from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { CopyButton } from "../../components/ui/CopyButton";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Switch } from "../../components/ui/Checkbox";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { Badge } from "../../components/ui/Badge";
import { Collapsible } from "../../components/ui/Collapsible";
import { api, uploadFile } from "../../lib/api";
import { formatBytes, formatDateTime, formatINR, formatNumber } from "../../lib/format";
import { DUR, EASE } from "../../lib/motion";
import { cn } from "../../lib/cn";
import { AGENT_ORDER, useRunEvents } from "../pipeline/useRunEvents";

const BASE = "/assets/samples/in-app-claim";
const LEVEL_LABEL = { pass: "Passed", warn: "Warning", fail: "Failed", info: "Info", pending: "Pending" };
const SCENARIOS = [
  ["clean_rear_end", "Clean rear-end", "Auto pre-auth"], ["fastag_mismatch", "FASTag mismatch", "SIU"],
  ["garage_overquote", "Garage overquote", "Approve revised"], ["theft_two_wheeler", "Two-wheeler theft", "Info requested"],
  ["flood_total_loss", "Flood total loss", "Total loss"],
];

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
    <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.toggle, ease: EASE }}
      className="flex items-start gap-3 py-2">
      <span className="mt-0.5 shrink-0" title={STATE_LABEL[step.state]}>{ICON[step.state]}</span>
      <span className="sr-only">{STATE_LABEL[step.state]}:</span>
      <div className="min-w-0">
        <p className="text-sm text-text">{step.label}</p>
        {step.detail && <p className={step.state === "error" ? "text-caption text-danger" : "text-caption text-muted"}>{step.detail}</p>}
      </div>
    </motion.li>
  );
}

// ------------------------------------------------------------------------------------------------ live run panel

/** Live view of one pipeline run over SSE (the compact precursor of the Phase 6 Agent Theatre). */
function RunProgress({ runId, onDone }) {
  const run = useRunEvents(runId);
  const qc = useQueryClient();
  const notified = useRef(false);
  useEffect(() => {
    if (run.done && !notified.current) {
      notified.current = true;
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["claims"] });
      qc.invalidateQueries({ queryKey: ["dev", "runs"] });
      onDone?.(run);
    }
  }, [run, qc, onDone]);
  return (
    <section className="mt-4 rounded-md border border-border" aria-live="polite" aria-label={`Pipeline run ${runId}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <span className="text-sm font-semibold text-text">Pipeline <span className="mono">{runId}</span></span>
        {run.done ? (run.failed ? <StatusFlag size="sm" level="fail" label="Run failed" /> : <StatusFlag size="sm" level="pass" label="Run complete" />)
          : <span className="inline-flex items-center gap-2 text-caption text-muted"><Spinner size={14} label="Running" />{run.connected ? "Streaming events" : "Connecting…"}</span>}
      </header>
      <ol className="divide-y divide-border">
        {AGENT_ORDER.map(([key, label]) => {
          const a = run.agents[key];
          const status = !a ? "pending" : a.status === "done" ? "done" : "running";
          return (
            <li key={key} className="flex items-start gap-3 px-4 py-2">
              <span className="mt-0.5 shrink-0">{ICON[status]}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-text">
                  <span className="font-medium">{label}</span>
                  {a?.status === "done" && <StatusFlag size="sm" level={a.level} label={a.summary} />}
                  {a?.source && a.source !== "live" && a.source !== "python" && (
                    <Badge tone={a.source === "fallback" ? "warning" : "outline"}>{a.source === "fallback" ? "Fallback" : a.source === "demo" ? "Demo output" : a.source}</Badge>
                  )}
                  {a?.duration_ms != null && <span className="num text-caption text-subtle">{(a.duration_ms / 1000).toFixed(1)} s</span>}
                </p>
                {a?.lines?.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {a.lines.slice(-4).map((l, i) => (
                      <li key={i} className={cn("text-caption", l.level === "fail" ? "text-danger" : l.level === "warn" ? "text-warning" : "text-muted")}>
                        <span className="sr-only">{LEVEL_LABEL[l.level] ?? ""}: </span>{l.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {run.decision && (
        <div className="border-t border-border px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-text">
            <span className="font-semibold">Decision:</span> {run.decision.action?.replaceAll("_", " ")} · route {run.decision.route} ·
            score {run.decision.score} ({run.decision.band}) · net payable {formatINR(run.decision.net_payable)}
          </p>
          {run.decision.customer_message && <p className="mt-1 text-muted">Customer message: “{run.decision.customer_message}”</p>}
        </div>
      )}
      {run.completed && (
        <p className="border-t border-border px-4 py-2 text-caption text-muted">
          {(run.completed.duration_ms / 1000).toFixed(1)} s · {formatNumber(run.completed.tokens ?? 0)} Gemini tokens · status {run.completed.status}
        </p>
      )}
      {run.failed && <p className="border-t border-border px-4 py-2 text-sm text-danger">{run.failed.message}</p>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ sample claim

/** Runs the real in-app filing flow (§11.6): create draft → upload each file (multipart) → submit → follow the agent pipeline. */
function SampleClaimCard() {
  const sample = useSample();
  const qc = useQueryClient();
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [runId, setRunId] = useState(null);
  const [pace, setPace] = useState("presentation");
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
      { label: "Submit claim and start the agent pipeline" },
    ].map((p) => ({ ...p, state: "pending", detail: null }));
    setSteps(plan);
    setResult(null);
    setRunId(null);
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
      const { claim: submitted, run_id: rid } = await api(`/claims/${claim.id}/submit`, { method: "POST", body: { pace } });
      update(i, { state: "done", detail: `Status ${submitted.status} · admins notified · pipeline ${rid}` });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["claims"] });
      if (alive.current) { setResult(submitted); setRunId(rid); }
    } catch (e) {
      update(i, { state: "error", detail: e.message || "Request failed" });
    } finally {
      if (alive.current) setRunning(false);
    }
  }

  if (sample.isPending) return <Card title="Sample in-app claim"><Skeleton className="h-24 w-full" /></Card>;
  if (sample.isError) {
    return <Card title="Sample in-app claim"><ErrorState title="Sample set missing" error={sample.error} onRetry={() => sample.refetch()} retrying={sample.isFetching} /></Card>;
  }
  const s = sample.data;
  return (
    <Card title="Sample in-app claim"
      subtitle="Files a claim through the real endpoints and runs the full agent pipeline on it (live Gemini unless the LLM mode is demo).">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Policyholder</dt><dd className="truncate text-text">{s.customer_name}</dd>
          <dt className="text-muted">Policy</dt><dd className="mono truncate text-text">{s.policy_no}</dd>
          <dt className="text-muted">Vehicle</dt><dd className="truncate text-text">{s.vehicle} · <span className="mono">{s.registration}</span></dd>
          <dt className="text-muted">Incident</dt><dd className="truncate text-text">{s.claim.incident.location_text}</dd>
        </dl>
        <div className="flex flex-col items-end gap-2">
          <SegmentedControl size="sm" label="Pace" value={pace} onChange={setPace}
            options={[{ value: "presentation", label: "Presentation" }, { value: "fast", label: "Real speed" }]} />
          <Button icon={FilePlus2} onClick={run} loading={running} disabledReason={running ? "A sample claim is being filed" : undefined}>
            Create sample in-app claim
          </Button>
        </div>
      </div>

      <ul className="mt-6 grid grid-cols-4 gap-3" aria-label="Files that will be uploaded">
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
      {runId && <RunProgress runId={runId} />}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: DUR.collapse, ease: EASE }}
            className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-success-bg px-4 py-3">
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

// ------------------------------------------------------------------------------------------------ LLM mode + Vertex

function useLlmMode() {
  return useQuery({ queryKey: ["dev", "llm-mode"], queryFn: () => api("/dev/llm-mode") });
}

function LlmCard() {
  const qc = useQueryClient();
  const mode = useLlmMode();
  const setMode = useMutation({
    mutationFn: (m) => api("/dev/llm-mode", { method: "POST", body: { mode: m } }),
    onSuccess: (data) => { qc.setQueryData(["dev", "llm-mode"], data); qc.invalidateQueries({ queryKey: ["system", "status"] }); toast.success(`LLM mode: ${data.configured}`); },
    onError: (e) => toast.error(e.message),
  });
  const failure = useMutation({
    mutationFn: (body) => api("/dev/force-failure", { method: "POST", body }),
    onSuccess: (data) => qc.setQueryData(["dev", "llm-mode"], data),
    onError: (e) => toast.error(e.message),
  });
  const test = useMutation({ mutationFn: () => api("/dev/health/vertex", { method: "POST" }) });

  if (mode.isPending) return <Card title="LLM mode"><Skeleton className="h-24 w-full" /></Card>;
  if (mode.isError) return <Card title="LLM mode"><ErrorState error={mode.error} onRetry={() => mode.refetch()} retrying={mode.isFetching} /></Card>;
  const m = mode.data;
  return (
    <Card title="LLM mode" subtitle={`Gemini on Vertex AI · ${m.model} · ${m.location}`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl label="LLM mode" value={m.configured} onChange={(v) => setMode.mutate(v)}
            options={[{ value: "auto", label: "Auto" }, { value: "live", label: "Live" }, { value: "demo", label: "Demo" }]} />
          <span className="flex flex-wrap items-center gap-2">
            <StatusFlag size="sm" level={m.credentials_present ? "pass" : "warn"} label={m.credentials_present ? "Key file present" : "Key file missing"} />
            <StatusFlag size="sm" level={m.effective === "demo" ? "warn" : "pass"} label={`Effective: ${m.effective}`} />
          </span>
        </div>
        <p className="text-caption text-muted">Auto and Live call Gemini; a failed step retries, then falls back. Demo uses the recorded scenario outputs (or conservative defaults). Default from .env: {m.env_default}.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={PlugZap} loading={test.isPending} onClick={() => test.mutate()}>Test Vertex connection</Button>
          {test.data && (
            <StatusFlag level={test.data.ok ? "pass" : "fail"}
              label={test.data.ok ? `Connected · ${test.data.latency_ms} ms · ${test.data.tokens} tokens` : `Failed: ${test.data.message}`} />
          )}
          {test.isError && <StatusFlag level="fail" label={test.error.message} />}
        </div>
        <div className="border-t border-border pt-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text"><TriangleAlert size={16} className="text-warning" aria-hidden="true" />Force an agent failure</h3>
          <p className="text-caption text-muted">The next live calls of the chosen agent time out: the Theatre shows three retries, then the fallback. The run never hangs.</p>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
            {["intake", "document", "damage", "investigation", "communication"].map((a) => (
              <Switch key={a} size="sm" label={a[0].toUpperCase() + a.slice(1)} checked={m.forced_failures.includes(a)}
                onChange={(on) => failure.mutate({ agent: a, on })} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ scenario replays

function ScenarioCard() {
  const [runId, setRunId] = useState(null);
  const [claimId, setClaimId] = useState(null);
  const replay = useMutation({
    mutationFn: (sid) => api(`/dev/scenarios/${sid}/replay`, { method: "POST", body: { pace: "presentation" } }),
    onSuccess: (data) => { setRunId(data.run_id); setClaimId(data.claim_id); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card title="Demo scenarios (Demo mode)"
      subtitle="Replays a §14.3 scenario as a new in-app claim with the recorded agent outputs; Python still computes money, score and decision. Seeded claims are not changed.">
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map(([sid, label, outcome]) => (
          <Button key={sid} size="sm" variant="secondary" icon={PlayCircle} loading={replay.isPending && replay.variables === sid}
            disabledReason={replay.isPending ? "A replay is starting" : undefined} onClick={() => replay.mutate(sid)}>
            {label} <span className="text-caption text-muted">→ {outcome}</span>
          </Button>
        ))}
      </div>
      {runId && (
        <>
          <RunProgress key={runId} runId={runId} />
          <div className="mt-3 flex justify-end"><Button size="sm" icon={ExternalLink} to={`/claims/${claimId}`}>Open {claimId}</Button></div>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ run inspector

function useRuns() {
  return useQuery({ queryKey: ["dev", "runs"], queryFn: () => api("/dev/runs"), refetchInterval: 10_000 });
}

function CallDetail({ call }) {
  return (
    <div className="rounded-md border border-border">
      <Collapsible headerClassName="px-3" contentClassName="px-3 pb-3"
        title={<span className="flex flex-wrap items-center gap-2 text-sm text-text">
          <span className="font-semibold">{call.agent}</span>
          <StatusFlag size="sm" level={call.ok ? "pass" : "warn"} label={call.source ?? (call.ok ? "live" : "failed")} />
          <span className="num text-caption text-muted">{formatNumber(call.input_tokens ?? 0)} in · {formatNumber(call.output_tokens ?? 0)} out · {formatNumber(call.thinking_tokens ?? 0)} thinking · {call.latency_ms ?? 0} ms · {call.attempts?.length ?? 0} attempt(s)</span>
        </span>}>
        <div className="flex flex-col gap-3">
          {call.error && <p className="text-sm text-danger">{call.error}</p>}
          {call.media?.length > 0 && <p className="text-caption text-muted">Media: {call.media.join(", ")}</p>}
          <div>
            <h4 className="text-caption font-semibold text-muted">Rendered prompt</h4>
            <pre className="mono mt-1 max-h-64 overflow-auto rounded-md bg-bg-muted p-3 text-caption whitespace-pre-wrap text-text">{call.prompt}</pre>
          </div>
          {(call.attempts ?? []).map((a) => (
            <div key={a.n}>
              <h4 className="text-caption font-semibold text-muted">Attempt {a.n} · {a.latency_ms} ms{a.error ? ` · ${a.error}` : ""}</h4>
              {a.raw && <pre className="mono mt-1 max-h-64 overflow-auto rounded-md bg-bg-muted p-3 text-caption whitespace-pre-wrap text-text">{a.raw}</pre>}
            </div>
          ))}
          {!call.attempts?.length && call.output && (
            <pre className="mono max-h-64 overflow-auto rounded-md bg-bg-muted p-3 text-caption whitespace-pre-wrap text-text">{JSON.stringify(call.output, null, 2)}</pre>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

function RunDetail({ runId }) {
  const run = useQuery({ queryKey: ["dev", "run", runId], queryFn: () => api(`/dev/runs/${runId}`) });
  if (run.isPending) return <Skeleton className="h-40 w-full" />;
  if (run.isError) return <ErrorState compact error={run.error} onRetry={() => run.refetch()} retrying={run.isFetching} />;
  const r = run.data;
  const t = r.totals ?? {};
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-text">
        <span className="mono font-semibold">{r.id}</span> · <span className="mono">{r.claim_id}</span> · {r.mode} · {r.pace}
        <StatusFlag size="sm" level={r.status === "completed" ? "pass" : r.status === "running" ? "pending" : "fail"} label={r.status} />
        <Button size="sm" variant="ghost" icon={ExternalLink} to={`/claims/${r.claim_id}`}>Open claim</Button>
      </div>
      {/* A run still in progress (e.g. the page was closed mid-run and reopened): follow it live — SSE replays every event so far, then streams. */}
      {r.status === "running" && <RunProgress runId={r.id} onDone={() => run.refetch()} />}
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Duration", r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)} s` : "—"], ["Gemini calls", t.llm_calls ?? 0],
          ["Input tokens", formatNumber(t.input_tokens ?? 0)], ["Output + thinking", formatNumber((t.output_tokens ?? 0) + (t.thinking_tokens ?? 0))],
          ["Total tokens", formatNumber(t.total_tokens ?? 0)]].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border px-3 py-2"><dt className="text-caption text-muted">{k}</dt><dd className="num text-lg font-semibold text-text">{v}</dd></div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">{(r.calls ?? []).map((c, i) => <CallDetail key={`${c.agent}-${i}`} call={c} />)}</div>
      <Collapsible title={<span className="text-sm font-semibold text-text">Events ({r.events.length})</span>} headerClassName="px-0" contentClassName="px-0">
        <ol className="mono max-h-80 overflow-auto rounded-md bg-bg-muted p-3 text-caption text-text">
          {r.events.map((e) => <li key={e.id}><span className="text-subtle">#{e.id} {e.data.ts?.slice(11, 23)}</span> {e.event} {JSON.stringify({ ...e.data, ts: undefined })}</li>)}
        </ol>
      </Collapsible>
    </div>
  );
}

function RunInspector() {
  const runs = useRuns();
  const [picked, setSelected] = useState(null);
  // Reopening Dev Tools while a run is in progress selects it, so its live stream resumes without a click.
  const selected = picked ?? runs.data?.find((r) => r.status === "running")?.id ?? null;
  const qc = useQueryClient();
  const rerun = useMutation({
    mutationFn: (cid) => api(`/dev/claims/${cid}/rerun`, { method: "POST", body: { pace: "fast" } }),
    onSuccess: (d) => { toast.success(`Re-running ${d.claim_id} (${d.run_id})`); qc.invalidateQueries({ queryKey: ["dev", "runs"] }); setSelected(d.run_id); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card title="Pipeline run inspector" subtitle="Events, rendered prompts, raw responses, tokens and latency per run (pipeline_runs.json, last 40 runs).">
      {runs.isPending ? <Skeleton className="h-32 w-full" />
        : runs.isError ? <ErrorState error={runs.error} onRetry={() => runs.refetch()} retrying={runs.isFetching} />
          : !runs.data.length ? <EmptyState compact title="No pipeline runs yet" description="Create the sample claim or replay a scenario to see a run here." />
            : (
              <div className="flex flex-col gap-4">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface text-left text-caption text-muted"><tr className="border-b border-border">
                      {["Run", "Claim", "Started", "Mode", "Status", "Outcome", "Tokens", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {runs.data.map((r) => (
                        <tr key={r.id} className={cn("border-b border-border last:border-0", selected === r.id && "bg-bg-muted")}>
                          <td className="px-2 py-2"><button type="button" className="mono text-blue-600 hover:underline" onClick={() => setSelected(r.id)}>{r.id}</button></td>
                          <td className="mono px-2 py-2 text-text">{r.claim_id}</td>
                          <td className="px-2 py-2 text-muted">{formatDateTime(r.started_at)}</td>
                          <td className="px-2 py-2 text-muted">{r.mode}</td>
                          <td className="px-2 py-2"><StatusFlag size="sm" level={r.status === "completed" ? "pass" : r.status === "running" ? "pending" : "fail"} label={r.status} /></td>
                          <td className="px-2 py-2 text-text">{r.result ? `${r.result.action?.replaceAll("_", " ")} · ${r.result.score}` : "—"}</td>
                          <td className="num px-2 py-2 text-text">{formatNumber(r.totals?.total_tokens ?? 0)}</td>
                          <td className="px-2 py-2"><Button size="sm" variant="ghost" icon={RotateCcw} loading={rerun.isPending && rerun.variables === r.claim_id}
                            onClick={() => rerun.mutate(r.claim_id)}>Re-run</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selected && <div className="border-t border-border pt-4"><RunDetail key={selected} runId={selected} /></div>}
              </div>
            )}
    </Card>
  );
}

export default function DevToolsPage() {
  return (
    <>
      <PageHeader title="Dev Tools" description="LLM mode, Vertex connection, sample claim and scenario replays, and the pipeline run inspector." />
      <div className="grid max-w-5xl gap-6">
        <LlmCard />
        <SampleClaimCard />
        <ScenarioCard />
        <RunInspector />
      </div>
    </>
  );
}
