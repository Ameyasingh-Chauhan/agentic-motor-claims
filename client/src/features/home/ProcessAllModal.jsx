import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Loader2, Sparkles } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";

/** Poll a pipeline run until it finishes (completed/failed/interrupted) — used to run the queue one claim at a time. */
async function waitForRun(runId) {
  for (;;) {
    const run = await api(`/pipeline/${runId}`);
    if (run.status !== "running") return run;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

const STATUS_ICON = { queued: null, running: Loader2, done: CircleCheck, failed: CircleX };

/**
 * "Process all pending" (Feature B): runs AI processing on every claim in the current "AI pending" list one after
 * another — not all at once, so the server isn't asked to run many pipelines concurrently — with live progress.
 */
export function ProcessAllModal({ open, onClose, claimIds }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (open) { setRows(claimIds.map((id) => ({ id, status: "queued" }))); cancelled.current = false; }
  }, [open, claimIds]);

  const setStatus = (id, status, message) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status, message } : r)));

  const start = async () => {
    setRunning(true);
    for (const id of claimIds) {
      if (cancelled.current) break;
      setStatus(id, "running");
      try {
        const out = await api(`/claims/${id}/process`, { method: "POST", body: {} });
        const run = await waitForRun(out.run_id);
        setStatus(id, run.status === "completed" ? "done" : "failed", run.status === "completed" ? null : "Pipeline did not complete");
      } catch (e) {
        setStatus(id, "failed", e.body?.detail?.message || e.message || "Failed to start");
      }
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["claims"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const close = () => { cancelled.current = true; onClose(); };
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const finished = !running && rows.length > 0 && rows.every((r) => r.status === "done" || r.status === "failed");

  return (
    <Modal open={open} onClose={close} title="Process all pending" size="md"
      footer={(
        <>
          <Button variant="ghost" onClick={close}>{finished ? "Close" : "Cancel"}</Button>
          {!running && !finished && <Button icon={Sparkles} onClick={start}>Start ({claimIds.length})</Button>}
        </>
      )}>
      <p className="text-sm text-text">
        Runs AI processing on these {claimIds.length} claim{claimIds.length === 1 ? "" : "s"} one after another. You can close this
        and keep working — each claim updates on Home as soon as its run finishes.
      </p>
      {rows.length > 0 && (running || finished) && (
        <>
          <p className="mt-3 text-caption text-subtle">{done + failed} of {rows.length} done{failed ? ` · ${failed} failed` : ""}</p>
          <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {rows.map((r) => {
              const Icon = STATUS_ICON[r.status];
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                  {Icon ? (
                    <Icon size={16} aria-hidden="true" className={r.status === "running" ? "animate-spin text-tint-blue"
                      : r.status === "done" ? "text-success" : "text-danger"} />
                  ) : <span className="h-4 w-4 shrink-0 rounded-full border border-border" />}
                  <button type="button" className="mono text-left text-text hover:underline" onClick={() => navigate(`/claims/${r.id}`)}>{r.id}</button>
                  {r.message && <span className="truncate text-caption text-danger">{r.message}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
