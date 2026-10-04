import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Eye, Radio, RotateCcw, Timer, UserRound, Users, WifiOff } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { api, ApiError } from "../../lib/api";
import { cn } from "../../lib/cn";
import { EASE } from "../../lib/motion";
import { usePersistentState } from "../../hooks/usePersistentState";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Skeleton } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/EmptyState";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { useClaim, claimKey } from "../claims/useClaim";
import "../claims/claims.css";
import { useTheatre } from "./useTheatre";
import { PipelineCanvas } from "./PipelineCanvas";
import { LogPanel } from "./LogPanel";
import { CustomerResult, HandlerResult } from "./ResultView";
import { customerSafe, ROUTE_TEXT, ROUTE_TONE } from "./theatreModel";
import { reduce, initial } from "./useRunEvents";
import "./theatre.css";

const TERMINAL = new Set(["completed", "failed", "interrupted"]);

function Elapsed({ start, end, running }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);
  const ms = start ? Math.max(0, (end ? new Date(end) : new Date(now)) - new Date(start)) : 0;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-bg-subtle px-2 py-1 text-sm text-text" aria-label="Elapsed time">
      <Timer size={14} className="text-muted" aria-hidden="true" /><span className="num tabular-nums">{(ms / 1000).toFixed(1)} s</span>
    </span>
  );
}

function Completion({ claim, decision, customerView, onResults, autoIn }) {
  const route = decision?.route;
  const tone = customerView ? "success" : ROUTE_TONE[route] ?? "warning";
  const cls = { success: "border-success bg-success-bg", warning: "border-warning bg-warning-bg", danger: "border-danger bg-danger-bg" }[tone];
  return (
    <motion.div layout initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: EASE }}
      className={cn("flex flex-wrap items-center gap-4 rounded-lg border-2 px-4 py-3", cls)} role="status">
      <StatusFlag level={{ success: "pass", warning: "warn", danger: "fail" }[tone]} label={customerView ? "All done" : route === "auto" ? "Auto-decided" : route === "SIU" ? "SIU referral" : "Handler review"} />
      <p className="min-w-0 flex-1 text-sm text-text">
        {customerView ? (decision?.customer_message ?? "Your claim has been processed — here's your update.")
          : `${ROUTE_TEXT[route] ?? "Decision recorded"}${decision?.net_payable != null ? ` · net payable ₹${Math.round(decision.net_payable).toLocaleString("en-IN")}` : ""}${decision?.score != null ? ` · risk ${decision.score}` : ""}`}
      </p>
      <Button iconRight={ArrowRight} onClick={onResults}>View full results{autoIn != null ? ` (${autoIn})` : ""}</Button>
    </motion.div>
  );
}

/** Agent Theatre (§10.7) at /processing/:claimId, and the Result view (§10.8) at ?view=result. */
export default function TheatrePage() {
  const { claimId } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const admin = user?.role === "admin";
  const claimQ = useClaim(claimId);
  const [pace, setPace] = usePersistentState("amc:theatre-pace", "presentation");
  const [view, setView] = usePersistentState("amc:theatre-view", "handler");
  const customerView = !admin || view === "customer";
  const resultView = params.get("view") === "result";

  const runQ = useQuery({
    queryKey: ["pipeline", "by-claim", claimId],
    queryFn: () => api(`/pipeline/by-claim/${encodeURIComponent(claimId)}`),
    retry: (n, e) => e instanceof ApiError && e.status === 404 && n < 10,
    retryDelay: 800,
    staleTime: Infinity,
  });
  const run = runQ.data;
  const finishedAtOpen = useMemo(() => (run ? TERMINAL.has(run.status) : false), [run?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = useTheatre(run?.id ?? location.state?.runId ?? null, { finishedAtOpen: Boolean(finishedAtOpen), pace });

  // Admin "Customer view": re-derive the state from customer-safe events only (same projection as the server's).
  const shown = useMemo(() => {
    if (!customerView || !admin) return t;
    let s = initial;
    for (const ev of t.events) { const safe = customerSafe(ev); if (safe) s = reduce(s, { type: "event", event: safe }); }
    return { ...t, ...s };
  }, [t, customerView, admin]);

  const started = t.events.find((e) => e.event === "run_started");
  const ended = t.events.find((e) => e.event === "run_completed" || e.event === "run_failed");
  const mode = started?.data.mode ?? run?.mode;
  const running = Boolean(started) && !ended;

  // Completion → refresh the claim everywhere, then auto-open the results after 2 s (live runs only).
  const [autoIn, setAutoIn] = useState(null);
  const autoTimer = useRef(null);
  useEffect(() => {
    if (!t.done) return undefined;
    qc.invalidateQueries({ queryKey: claimKey(claimId) });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["claims"] });
    if (finishedAtOpen || t.replaying || resultView || t.failed) return undefined;
    setAutoIn(2);
    autoTimer.current = setInterval(() => setAutoIn((n) => {
      if (n <= 1) { clearInterval(autoTimer.current); setParams({ view: "result" }); return null; }
      return n - 1;
    }), 1000);
    return () => clearInterval(autoTimer.current);
  }, [t.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const stopAuto = () => { clearInterval(autoTimer.current); setAutoIn(null); };

  const claim = claimQ.data;
  if (claimQ.isError) {
    return <ErrorState title={claimQ.error?.status === 404 ? "We couldn't find that claim" : "We couldn't load this claim"} error={claimQ.error} onRetry={() => claimQ.refetch()} />;
  }

  if (resultView && claim) {
    if (claim.status === "PROCESSING" || claim.status === "SUBMITTED") {
      return <div className="flex flex-col gap-4"><ErrorState title="Still processing" error={{ message: "The AI agents are still working on this claim." }} onRetry={() => setParams({})} /></div>;
    }
    const seconds = claim.ai_processing_s ?? (run?.duration_ms != null ? Math.round(run.duration_ms / 100) / 10 : ended?.data.duration_ms != null ? Math.round(ended.data.duration_ms / 100) / 10 : null);
    return (
      <div className="flex flex-col gap-4">
        <div className="no-print flex justify-between gap-3">
          <Button variant="ghost" icon={RotateCcw} onClick={() => setParams({})}>Back to the Theatre</Button>
          {admin && <SegmentedControl size="sm" label="Result view" value={view} onChange={setView} options={[{ value: "handler", label: "Handler view", icon: Users }, { value: "customer", label: "Customer view", icon: UserRound }]} />}
        </div>
        {customerView ? <CustomerResult claim={claim} /> : <HandlerResult claim={claim} seconds={seconds} />}
      </div>
    );
  }

  const noRun = runQ.isError && !(location.state?.runId);
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold tracking-wide text-muted uppercase">Agent Theatre</p>
          {claim ? (
            <h1 className="truncate text-lg font-semibold text-text"><span className="mono">{claim.id}</span> · {claim.vehicle.make} {claim.vehicle.model} · <span className="mono">{claim.registration}</span> · {claim.customer_name}</h1>
          ) : <Skeleton className="mt-1 h-6 w-96" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {running && t.connected && <Badge tone="blue" icon={Radio}>Live</Badge>}
          {running && !t.connected && <Badge tone="warning" icon={WifiOff}>Reconnecting…</Badge>}
          {mode === "demo" && <StatusFlag level="warn" label="Demo mode" size="sm" title="AI responses are pre-recorded or default — no live Gemini calls" />}
          {t.replaying && <Badge tone="outline">Replay</Badge>}
          <Elapsed start={started?.data.ts} end={ended?.data.ts} running={running} />
          <SegmentedControl size="sm" label="Pace" value={pace} onChange={setPace} options={[{ value: "presentation", label: "Presentation pace" }, { value: "fast", label: "Real speed" }]} />
          {admin && <SegmentedControl size="sm" label="Audience" value={view} onChange={setView} options={[{ value: "handler", label: "Handler view", icon: Users }, { value: "customer", label: "Customer view", icon: UserRound }]} />}
        </div>
      </header>

      {noRun ? (
        <ErrorState title="No processing run for this claim" error={{ message: claim?.status === "DRAFT" ? "This claim hasn't been submitted yet." : "This claim was not processed in the app (seeded claims have no live run)." }}
          onRetry={() => (claim?.status === "DRAFT" ? navigate(`/file-claim?draft=${claimId}&step=review`) : navigate(`/claims/${claimId}`))} />
      ) : (
        <div className="theatre-grid">
          <section aria-label="Agent pipeline" className="min-w-0 rounded-lg border border-border bg-surface p-4 shadow-sm">
            <AnimatePresence>
              {t.done && (
                <div className="mb-4">
                  {t.failed ? (
                    <ErrorState compact title="The pipeline stopped" error={{ message: t.failed.message }} onRetry={() => navigate(`/claims/${claimId}`)} />
                  ) : (
                    <Completion claim={claim} decision={shown.decision} customerView={customerView} autoIn={autoIn}
                      onResults={() => { stopAuto(); setParams({ view: "result" }); }} />
                  )}
                </div>
              )}
            </AnimatePresence>
            {t.events.length === 0 ? (
              <div className="flex flex-col gap-10 py-2" aria-busy="true">
                <Skeleton className="mx-auto h-20 w-full max-w-sm" rounded="lg" />
                <div className="grid grid-cols-3 gap-4"><Skeleton className="h-20" rounded="lg" /><Skeleton className="h-20" rounded="lg" /><Skeleton className="h-20" rounded="lg" /></div>
                <Skeleton className="mx-auto h-20 w-full max-w-sm" rounded="lg" />
              </div>
            ) : (
              <PipelineCanvas agents={shown.agents} customer={customerView} />
            )}
            {t.done && (
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                {autoIn != null && <Button variant="ghost" onClick={stopAuto}>Stay here</Button>}
                <Button variant="secondary" icon={RotateCcw} onClick={() => { stopAuto(); t.replay(); }} disabled={t.replaying}>Replay</Button>
                <Button variant="ghost" icon={Eye} to={`/claims/${claimId}`}>Open claim</Button>
              </div>
            )}
          </section>
          <div className="theatre-log">
            <LogPanel events={shown.events} customer={customerView} t0={started?.data.ts} />
          </div>
        </div>
      )}
    </div>
  );
}
