import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Building2, ChevronDown, Cpu, UserRound } from "lucide-react";
import { Avatar } from "../../../components/ui/Avatar";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cn } from "../../../lib/cn";
import { formatDateTime, formatHours } from "../../../lib/format";
import { DUR, EASE } from "../../../lib/motion";
import { actorOf } from "../claimModel";

function gap(prev, ts) {
  if (!prev) return null;
  const h = (new Date(ts) - new Date(prev)) / 3_600_000;
  if (h <= 0) return "same time";
  if (h < 1 / 60) return `+${Math.max(1, Math.round(h * 3600))} s`;
  return `+${formatHours(h)}`;
}

function ActorIcon({ actor }) {
  if (actor.kind === "agent") return <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tint-blue-bg text-tint-blue"><Bot size={16} aria-hidden="true" /></span>;
  if (actor.kind === "human") return <Avatar name={actor.label} size="sm" />;
  if (actor.kind === "customer") return <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tint-orange-bg text-tint-orange"><UserRound size={16} aria-hidden="true" /></span>;
  return <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-bg text-muted"><Building2 size={16} aria-hidden="true" /></span>;
}

function Event({ e, prevTs, claim, people, last }) {
  const actor = actorOf(e.actor, claim, people);
  return (
    <li className="relative flex gap-3 pb-5">
      {!last && <span className="absolute top-9 bottom-0 left-4 w-px bg-border" aria-hidden="true" />}
      <span className="relative shrink-0"><ActorIcon actor={actor} /></span>
      <div className="min-w-0 pt-1">
        <p className="text-sm text-text">{e.text}</p>
        <p className="text-caption text-subtle">
          {actor.label} · {formatDateTime(e.ts)}{gap(prevTs, e.ts) && <span className="ml-1 text-muted">({gap(prevTs, e.ts)})</span>}
        </p>
      </div>
    </li>
  );
}

/** Consecutive agent events = one pipeline run, shown as a collapsible group. */
function group(events) {
  const out = [];
  for (const e of events) {
    const isAgent = e.actor?.startsWith("agent:");
    const lastGroup = out[out.length - 1];
    if (isAgent && lastGroup?.type === "pipeline") lastGroup.events.push(e);
    else if (isAgent) out.push({ type: "pipeline", events: [e] });
    else out.push({ type: "event", event: e });
  }
  return out.map((g) => (g.type === "pipeline" && g.events.length === 1 ? { type: "event", event: g.events[0] } : g));
}

function PipelineGroup({ g, prevTs, claim, people, last }) {
  const [open, setOpen] = useState(false);
  const secs = (new Date(g.events.at(-1).ts) - new Date(g.events[0].ts)) / 1000;
  return (
    <li className="relative pb-5">
      {!last && <span className="absolute top-9 bottom-0 left-4 w-px bg-border" aria-hidden="true" />}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint-blue-bg text-tint-blue"><Cpu size={16} aria-hidden="true" /></span>
        <span className="min-w-0 pt-1">
          <span className="flex items-center gap-1 text-sm font-medium text-text">
            AI pipeline · {g.events.length} steps · {Math.round(secs)} s
            <ChevronDown size={16} className={cn("text-subtle transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
          </span>
          <span className="block text-caption text-subtle">{formatDateTime(g.events[0].ts)}{gap(prevTs, g.events[0].ts) && ` (${gap(prevTs, g.events[0].ts)})`}</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: DUR.toggle, ease: EASE }}
            className="mt-3 ml-11">
            {g.events.map((e, i) => <Event key={`${e.ts}-${i}`} e={e} prevTs={i ? g.events[i - 1].ts : prevTs} claim={claim} people={people} last={i === g.events.length - 1} />)}
          </motion.ol>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Timeline tab (§10.4 C2) — also the customer's status timeline (`grouped={false}`; the server already filters it). */
export function TimelineTab({ claim, grouped = true }) {
  const people = claim.context?.people ?? {};
  const events = [...(claim.timeline ?? [])].sort((a, b) => a.ts.localeCompare(b.ts));
  if (!events.length) return <EmptyState title="No events yet" description="Events appear here as the claim moves through intake, checks and decisions." />;
  const items = grouped ? group(events) : events.map((event) => ({ type: "event", event }));
  let prevTs = null;
  return (
    <ol className="rounded-lg border border-border bg-surface p-6">
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const node = it.type === "pipeline"
          ? <PipelineGroup key={`g-${i}`} g={it} prevTs={prevTs} claim={claim} people={people} last={last} />
          : <Event key={`e-${i}`} e={it.event} prevTs={prevTs} claim={claim} people={people} last={last} />;
        prevTs = it.type === "pipeline" ? it.events.at(-1).ts : it.event.ts;
        return node;
      })}
    </ol>
  );
}
