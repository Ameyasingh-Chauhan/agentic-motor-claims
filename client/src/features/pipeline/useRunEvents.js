import { useEffect, useReducer } from "react";

const TYPES = ["run_started", "agent_started", "agent_progress", "tool_called", "tool_result", "agent_retry", "agent_completed",
  "agent_fallback", "decision", "run_completed", "run_failed"];

const initial = { events: [], agents: {}, decision: null, done: false, failed: null, connected: false, completed: null };

function reduce(state, action) {
  if (action.type === "connected") return { ...state, connected: action.value };
  if (action.type === "reset") return initial;
  const ev = action.event;
  if (state.events.some((e) => e.id === ev.id)) return state; // a replay after reconnect never duplicates
  const events = [...state.events, ev];
  const d = ev.data;
  const agents = { ...state.agents };
  if (d.agent) {
    const a = agents[d.agent] ?? { status: "waiting", lines: [] };
    if (ev.event === "agent_started") agents[d.agent] = { ...a, status: "running", display_name: d.display_name, started: d.ts };
    else if (ev.event === "agent_completed") agents[d.agent] = { ...a, status: "done", level: d.level, summary: d.summary, duration_ms: d.duration_ms, source: d.source };
    else if (ev.event === "agent_fallback") agents[d.agent] = { ...a, fallback: d.reason, lines: [...a.lines, { level: "warn", text: d.reason }] };
    else if (ev.event === "agent_retry") agents[d.agent] = { ...a, lines: [...a.lines, { level: "warn", text: `Retry ${d.attempt}: ${d.reason}` }] };
    else if (ev.event === "agent_progress") agents[d.agent] = { ...a, lines: [...a.lines, { level: d.level ?? "info", text: d.message }] };
    else if (ev.event === "tool_result") agents[d.agent] = { ...a, lines: [...a.lines, { level: d.level, text: `${d.tool}: ${d.summary} (${d.latency_ms} ms)` }] };
  }
  return {
    ...state, events, agents,
    decision: ev.event === "decision" ? d : state.decision,
    completed: ev.event === "run_completed" ? d : state.completed,
    failed: ev.event === "run_failed" ? d : state.failed,
    done: state.done || ev.event === "run_completed" || ev.event === "run_failed",
  };
}

/**
 * Follows GET /api/pipeline/{runId}/events (SSE, §15.4). EventSource reconnects by itself and sends Last-Event-ID, so the server
 * replays only what was missed; opening a finished run replays it in full. Closes when the run completes or fails.
 */
export function useRunEvents(runId) {
  const [state, dispatch] = useReducer(reduce, initial);
  useEffect(() => {
    dispatch({ type: "reset" });
    if (!runId) return undefined;
    const es = new EventSource(`/api/pipeline/${runId}/events`, { withCredentials: true });
    const onEvent = (type) => (msg) => {
      let data = {};
      try { data = JSON.parse(msg.data || "{}"); } catch { /* malformed event: ignore */ }
      dispatch({ type: "event", event: { id: Number(msg.lastEventId), event: type, data } });
      if (type === "run_completed" || type === "run_failed") es.close();
    };
    const handlers = TYPES.map((t) => [t, onEvent(t)]);
    handlers.forEach(([t, h]) => es.addEventListener(t, h));
    es.onopen = () => dispatch({ type: "connected", value: true });
    es.onerror = () => dispatch({ type: "connected", value: false });
    return () => {
      handlers.forEach(([t, h]) => es.removeEventListener(t, h));
      es.close();
    };
  }, [runId]);
  return state;
}

export const AGENT_ORDER = [
  ["intake", "Intake"], ["document", "Document"], ["verification", "Verification & DPI"], ["damage", "Damage & vehicle identity"],
  ["fraud", "Fraud"], ["adjudication", "Adjudication"], ["communication", "Communication"],
];
