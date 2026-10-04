import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initial, reduce, TYPES } from "./useRunEvents";

const TERMINAL = new Set(["run_completed", "run_failed"]);
const GAP = { presentation: { base: 280, agent_started: 450, agent_completed: 550, decision: 900, tool_result: 220 }, fast: { base: 30 } };

/**
 * Agent Theatre stream (§10.7). Follows the run's SSE stream (EventSource sends Last-Event-ID on reconnect, so a refresh or a
 * dropped connection resumes without duplicates) and releases events through a display queue:
 *  - live run: events show as they arrive (presentation pace only spaces out bursts);
 *  - a run that had already finished when the page opened: shown at once (final state) — `replay()` plays it again at the chosen pace.
 */
export function useTheatre(runId, { finishedAtOpen, pace }) {
  const [state, dispatch] = useReducer(reduce, initial);
  const [replaying, setReplaying] = useState(false);
  const all = useRef([]);
  const queue = useRef([]);
  const timer = useRef(null);
  const instant = useRef(Boolean(finishedAtOpen));
  const paceRef = useRef(pace);
  paceRef.current = pace;

  const pump = useCallback(() => {
    if (timer.current) return;
    if (instant.current) {
      while (queue.current.length) dispatch({ type: "event", event: queue.current.shift() });
      return;
    }
    const ev = queue.current.shift();
    if (!ev) return;
    dispatch({ type: "event", event: ev });
    if (TERMINAL.has(ev.event)) setReplaying(false);
    const g = GAP[paceRef.current] ?? GAP.presentation;
    timer.current = setTimeout(() => { timer.current = null; pump(); }, queue.current.length ? (g[ev.event] ?? g.base) : 0);
  }, []);

  useEffect(() => {
    if (!runId) return undefined;
    all.current = [];
    queue.current = [];
    dispatch({ type: "reset" });
    instant.current = Boolean(finishedAtOpen);
    const es = new EventSource(`/api/pipeline/${runId}/events`, { withCredentials: true });
    const onEvent = (type) => (msg) => {
      let data = {};
      try { data = JSON.parse(msg.data || "{}"); } catch { /* malformed event: ignore */ }
      const ev = { id: Number(msg.lastEventId), event: type, data };
      if (all.current.some((e) => e.id === ev.id)) return;
      all.current.push(ev);
      queue.current.push(ev);
      pump();
      if (TERMINAL.has(type)) {
        es.close();
        dispatch({ type: "connected", value: false });
        instant.current = false;   // later replays are paced
      }
    };
    const handlers = TYPES.map((t) => [t, onEvent(t)]);
    handlers.forEach(([t, h]) => es.addEventListener(t, h));
    es.onopen = () => dispatch({ type: "connected", value: true });
    es.onerror = () => dispatch({ type: "connected", value: false });
    return () => {
      handlers.forEach(([t, h]) => es.removeEventListener(t, h));
      es.close();
      clearTimeout(timer.current);
      timer.current = null;
    };
  }, [runId, finishedAtOpen, pump]);

  const replay = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    instant.current = false;
    dispatch({ type: "reset" });
    queue.current = [...all.current];
    setReplaying(true);
    pump();
  }, [pump]);

  return { ...state, replaying, replay, total: all.current.length };
}
