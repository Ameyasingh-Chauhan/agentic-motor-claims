import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { animate, createMotionPath, svg } from "animejs";
import { Check, ChevronDown, CircleX, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/cn";
import { usePrefersReducedMotion } from "../../hooks/useReducedMotion";
import { AGENTS } from "../home/constants";
import { CHECKING, CUSTOMER_CHECKING, CUSTOMER_TEXT, EDGES, ROWS, TOOL_LABEL } from "./theatreModel";

const META = Object.fromEntries(AGENTS.map((a) => [a.key, a]));
const NAME = { intake: "Intake", document: "Document", verification: "Verification & DPI", damage: "Damage & vehicle identity", fraud: "Fraud", adjudication: "Adjudication", communication: "Communication" };

function Thinking() {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-blue-600" animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />)}
    </span>
  );
}

function fmtMs(ms) {
  return ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** What the card says right now: the newest log line, or — while the agent waits on the model — what it is checking. */
function useLiveStatus(agent, a, customer) {
  const [tick, setTick] = useState(0);
  const working = a?.status === "running";
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 2600);
    return () => clearInterval(t);
  }, [working]);
  if (!a || a.status === "waiting") return customer ? "Waiting" : "Queued";
  if (a.status === "done") return customer ? "Done" : a.summary;
  const list = (customer ? CUSTOMER_CHECKING : CHECKING)[agent] ?? [];
  const last = a.lines?.at(-1);
  const fresh = last && Date.now() - new Date(last.ts).getTime() < 2600;
  if (!customer && fresh) return last.text;
  return list.length ? `${customer ? "" : "Checking: "}${list[tick % list.length]}` : "Working";
}

export function AgentCard({ agent, a, customer, cardRef }) {
  const [open, setOpen] = useState(false);
  const status = useLiveStatus(agent, a, customer);
  const Icon = META[agent].icon;
  const tools = Object.keys(a?.tools ?? {});
  const state = !a || a.status === "waiting" ? "queued"
    : a.status === "running" ? (a.retry ? "retrying" : tools.length ? "tool" : "working")
    : a.source === "fallback" || a.fallback ? "fallback"
    : a.level === "fail" ? "fail" : a.level === "warn" ? "warn" : "done";
  const display = customer ? "done" : state;
  const tone = {
    queued: "border-dashed border-border-strong bg-surface",
    working: "border-blue-600 bg-surface theatre-glow", tool: "border-blue-600 bg-surface theatre-glow", retrying: "border-warning bg-surface",
    done: "border-success bg-surface", warn: "border-warning bg-surface", fail: "border-danger bg-surface", fallback: "border-border-strong bg-bg-subtle",
  }[state === "queued" || state === "working" || state === "tool" ? state : display];
  const lines = customer ? [] : a?.lines ?? [];
  const label = customer ? CUSTOMER_TEXT[agent] : NAME[agent];
  return (
    <motion.div ref={cardRef} layout="position" className={cn("relative rounded-lg border-2 p-3 transition-colors duration-200", tone)}
      initial={false} animate={{ scale: state === "working" || state === "tool" ? 1.01 : 1 }} transition={{ duration: 0.25 }}>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          state === "queued" ? "bg-bg-subtle text-subtle" : state === "working" || state === "tool" ? "bg-tint-blue-bg text-tint-blue"
            : display === "done" ? "bg-success-bg text-success" : display === "fail" ? "bg-danger-bg text-danger" : display === "fallback" ? "bg-neutral-bg text-muted" : "bg-warning-bg text-warning")}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm leading-tight font-semibold text-text">{label}</p>
            <span className="flex shrink-0 items-center gap-1 text-caption">
              {state === "queued" && <span className="text-subtle">{customer ? "Waiting" : "Queued"}</span>}
              {(state === "working" || state === "tool") && <Thinking />}
              {state === "retrying" && <span className="flex items-center gap-1 font-medium text-warning"><RotateCw size={12} className="animate-spin" aria-hidden="true" />Retrying {a.retry}/3</span>}
              {display === "done" && state !== "queued" && a?.status === "done" && <span className="flex items-center gap-1 font-medium text-success"><Check size={14} aria-hidden="true" />{customer ? "Done" : fmtMs(a.duration_ms)}</span>}
              {display === "warn" && <span className="flex items-center gap-1 font-medium text-warning"><TriangleAlert size={14} aria-hidden="true" />{fmtMs(a.duration_ms)}</span>}
              {display === "fail" && <span className="flex items-center gap-1 font-medium text-danger"><CircleX size={14} aria-hidden="true" />{fmtMs(a.duration_ms)}</span>}
              {display === "fallback" && <span className="font-medium text-muted">{a?.source === "demo" ? "Demo response" : "Fallback"}</span>}
            </span>
          </div>
          <div className="relative mt-0.5 h-5 overflow-hidden" aria-live="off">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p key={status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                className={cn("truncate text-caption", state === "queued" ? "text-subtle" : "text-muted")} title={status}>{status}</motion.p>
            </AnimatePresence>
          </div>
          {!customer && tools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tools.map((t) => (
                <motion.span key={t} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-1 rounded-sm border border-blue-600 px-1.5 py-0.5 text-caption text-blue-600">
                  <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />{TOOL_LABEL[t] ?? t}
                </motion.span>
              ))}
            </div>
          )}
        </div>
      </div>
      {lines.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="mt-2 flex w-full items-center justify-between rounded-sm px-1 text-caption text-muted hover:text-text">
            <span>{lines.length} log line{lines.length === 1 ? "" : "s"}</span>
            <ChevronDown size={14} aria-hidden="true" className={cn("transition-transform duration-200", open && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ol initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto border-t border-border pt-2">
                {lines.map((l, i) => (
                  <li key={i} className={cn("text-caption", l.level === "fail" ? "text-danger" : l.level === "warn" ? "text-warning" : "text-text")}>
                    <span className="mono mr-1 text-subtle">›</span>{l.text}
                  </li>
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

/**
 * Pipeline canvas: HTML agent cards in rows (Intake → three parallel lanes → Fraud → Adjudication → Communication) with an SVG
 * overlay of connectors. A connector draws itself (anime.js drawable) when its target starts; an orange pulse travels along it
 * (anime.js motion path → transforms) when its source hands off. Static with reduced motion.
 */
export function PipelineCanvas({ agents, customer }) {
  const wrap = useRef(null);
  const cards = useRef({});
  const paths = useRef({});
  const pulses = useRef({});
  const reduced = usePrefersReducedMotion();
  const [geo, setGeo] = useState({ w: 0, h: 0, d: {} });
  const [drawn, setDrawn] = useState({});
  const prev = useRef({});

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const d = {};
      for (const [from, to] of EDGES) {
        const a = cards.current[from]?.getBoundingClientRect(), b = cards.current[to]?.getBoundingClientRect();
        if (!a || !b) continue;
        const x1 = a.left + a.width / 2 - box.left, y1 = a.bottom - box.top, x2 = b.left + b.width / 2 - box.left, y2 = b.top - box.top;
        const my = (y2 - y1) / 2;
        d[`${from}>${to}`] = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${(y1 + my).toFixed(1)}, ${x2.toFixed(1)} ${(y2 - my).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      }
      setGeo({ w: box.width, h: box.height, d });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Object.values(cards.current).forEach((c) => c && ro.observe(c));
    return () => ro.disconnect();
  }, []);

  // Draw a connector when its target starts; pulse along outgoing connectors when a source completes.
  useEffect(() => {
    const anims = [];
    for (const [from, to] of EDGES) {
      const key = `${from}>${to}`;
      const target = agents[to]?.status;
      const source = agents[from]?.status;
      const p = paths.current[key];
      if (target && target !== "waiting" && !drawn[key]) {
        if (reduced || !p) setDrawn((s) => ({ ...s, [key]: true }));
        else anims.push(animate(svg.createDrawable(p), { draw: ["0 0", "0 1"], duration: 500, ease: "inOutQuad", onComplete: () => setDrawn((s) => ({ ...s, [key]: true })) }));
      }
      if (!reduced && source === "done" && prev.current[from] !== "done" && pulses.current[key] && p) {
        anims.push(animate(pulses.current[key], { ...createMotionPath(p), opacity: [{ to: 1, duration: 120 }, { to: 1, duration: 520 }, { to: 0, duration: 160 }], duration: 800, ease: "inOutSine" }));
      }
    }
    prev.current = Object.fromEntries(Object.entries(agents).map(([k, v]) => [k, v.status]));
    return () => anims.forEach((x) => x.pause());
  }, [agents, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrap} className="relative flex flex-col gap-10 py-2">
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" width={geo.w} height={geo.h} aria-hidden="true">
        {EDGES.map(([from, to]) => {
          const key = `${from}>${to}`;
          const d = geo.d[key];
          if (!d) return null;
          const active = agents[to] && agents[to].status !== "waiting";
          return (
            <g key={key}>
              <path d={d} fill="none" className="stroke-border-strong" strokeWidth="1.5" strokeDasharray="4 5" />
              {active && (drawn[key]
                ? <path d={d} fill="none" className="stroke-blue-600" strokeWidth="2" strokeLinecap="round" />
                : <path ref={(el) => { paths.current[key] = el; }} d={d} fill="none" className="stroke-blue-600" strokeWidth="2" strokeLinecap="round" />)}
              {drawn[key] && <path ref={(el) => { if (el) paths.current[key] = el; }} d={d} fill="none" stroke="none" />}
              <circle ref={(el) => { pulses.current[key] = el; }} r="5" cx="0" cy="0" className="fill-primary" opacity="0" />
            </g>
          );
        })}
      </svg>
      {ROWS.map((row, i) => (
        <div key={i} className={cn("relative grid gap-4", row.length === 3 ? "grid-cols-3" : "mx-auto w-full max-w-sm grid-cols-1")}>
          {row.length === 3 && (
            <span className="absolute -top-6 left-0 text-caption font-semibold tracking-wide text-subtle uppercase">Parallel lanes</span>
          )}
          {row.map((agent) => (
            <AgentCard key={agent} agent={agent} a={agents[agent]} customer={customer} cardRef={(el) => { cards.current[agent] = el; }} />
          ))}
        </div>
      ))}
    </div>
  );
}
