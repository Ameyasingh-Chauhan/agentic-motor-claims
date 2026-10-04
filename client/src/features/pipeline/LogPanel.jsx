import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, Play, Flag, Bot, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { AGENT_ICON } from "../home/constants";
import { TOOL_LABEL } from "./theatreModel";

function offset(ts, t0) {
  if (!ts || !t0) return "+00:00.0";
  const s = Math.max(0, (new Date(ts) - new Date(t0)) / 1000);
  return `+${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

const NAME = { intake: "Intake", document: "Document", verification: "Verification", damage: "Damage", fraud: "Fraud", adjudication: "Adjudication", communication: "Communication" };

/** One readable line per event. */
export function describe(ev, customer) {
  const d = ev.data;
  switch (ev.event) {
    case "run_started": return { icon: Play, text: customer ? "We've started processing your claim" : `Pipeline started · ${d.mode === "demo" ? "demo mode" : "live AI"} · ${d.pace === "fast" ? "real speed" : "presentation pace"}` };
    case "agent_started": return { agent: d.agent, text: `${d.display_name ?? NAME[d.agent]} ${customer ? "" : "agent started"}`.trim() };
    case "agent_progress": return { agent: d.agent, text: d.message, level: d.level !== "info" ? d.level : undefined };
    case "tool_called": return { agent: d.agent, text: `Calling ${TOOL_LABEL[d.tool] ?? d.tool} · ${d.input_summary ?? ""}` };
    case "tool_result": return { agent: d.agent, text: `${TOOL_LABEL[d.tool] ?? d.tool}: ${d.summary} · ${d.latency_ms} ms`, level: d.level };
    case "agent_retry": return { agent: d.agent, text: `Retry ${d.attempt}: ${d.reason}`, level: "warn" };
    case "agent_fallback": return { agent: d.agent, text: d.reason, level: "warn" };
    case "agent_completed": return { agent: d.agent, text: customer ? `${d.display_name ?? NAME[d.agent]} done` : `${NAME[d.agent]} done · ${d.summary}`, level: customer ? "pass" : d.level };
    case "decision": return { icon: Flag, text: customer ? "Your update is ready" : `Decision: ${d.action?.replace(/_/g, " ")} · route ${d.route} · risk ${d.score} (${d.band})`, level: customer ? undefined : { auto: "pass", handler: "warn", SIU: "fail" }[d.route] };
    case "run_completed": return { icon: Sparkles, text: customer ? "All done" : `Run completed in ${(d.duration_ms / 1000).toFixed(1)} s${d.tokens ? ` · ${d.tokens.toLocaleString("en-IN")} tokens` : ""}`, level: "pass" };
    case "run_failed": return { icon: Bot, text: d.message ?? "The run stopped", level: "fail" };
    default: return null;
  }
}

/** Live log (§10.7): chronological feed, auto-scroll with "Jump to latest" when the user scrolls up; polite live region. */
export function LogPanel({ events, customer, t0 }) {
  const box = useRef(null);
  const [pinned, setPinned] = useState(true);
  const rows = events.map((ev) => ({ ev, row: describe(ev, customer) })).filter((r) => r.row);
  useEffect(() => {
    if (pinned && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [rows.length, pinned]);
  const onScroll = () => {
    const el = box.current;
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };
  const last = rows.at(-1);
  return (
    <section aria-label="Live event log" className="relative flex h-full min-h-0 flex-col rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Live log</h2>
        <span className="num text-caption text-muted">{rows.length} events</span>
      </div>
      <ol ref={box} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <AnimatePresence initial={false}>
          {rows.map(({ ev, row }) => {
            const Icon = row.icon ?? AGENT_ICON[row.agent] ?? Bot;
            return (
              <motion.li key={ev.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-bg-subtle">
                <Icon size={14} className="mt-0.5 shrink-0 text-tint-blue" aria-hidden="true" />
                <span className="mono shrink-0 text-caption text-subtle">{offset(ev.data.ts, t0)}</span>
                <span className={cn("min-w-0 flex-1 text-caption break-words", row.level === "fail" ? "text-danger" : row.level === "warn" ? "text-warning" : "text-text")}>{row.text}</span>
                {row.level && row.level !== "info" && <StatusFlag size="sm" level={row.level} label={row.level === "pass" ? "OK" : row.level === "warn" ? "Check" : "Flag"} className="shrink-0" />}
              </motion.li>
            );
          })}
        </AnimatePresence>
        {rows.length === 0 && <li className="px-2 py-6 text-center text-sm text-subtle">Waiting for the first event…</li>}
      </ol>
      <p className="sr-only" aria-live="polite">{last?.row.text}</p>
      <AnimatePresence>
        {!pinned && (
          <motion.button type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={() => { setPinned(true); box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-caption font-medium text-on-primary shadow-md">
            <ArrowDown size={14} aria-hidden="true" />Jump to latest
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  );
}
