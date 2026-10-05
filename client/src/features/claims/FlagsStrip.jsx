import { CircleCheck, CircleX, Hourglass, Info, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/cn";

const STYLE = {
  fail: { icon: CircleX, cls: "bg-danger-bg text-danger hover:border-danger" },
  warn: { icon: TriangleAlert, cls: "bg-warning-bg text-warning hover:border-warning" },
  info: { icon: Info, cls: "bg-tint-blue-bg text-tint-blue hover:border-tint-blue" },
};

function Chip({ f, onFlag }) {
  const s = STYLE[f.level];
  return (
    <button type="button" onClick={() => onFlag(f)} title={`${f.group}: ${f.label} — show the evidence`}
      className={cn("inline-flex h-8 max-w-96 shrink-0 items-center gap-1 rounded-full border border-transparent px-3 text-sm font-medium transition-colors duration-150", s.cls)}>
      <s.icon size={16} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">{f.level === "fail" ? "Critical:" : f.level === "warn" ? "Warning:" : "Note:"}</span>
      <span className="truncate">{f.label}</span>
    </button>
  );
}

/** Flags strip (§10.4 B): red first, amber next, then a green "checks passed" count. Each chip jumps to its evidence.
 * Info-level flags (0 points, e.g. a policy verified from an upload) are not AI findings, so they still show before the
 * pipeline has run. */
export function FlagsStrip({ flags, passed, pending, onFlag }) {
  const info = flags.filter((f) => f.level === "info");
  if (pending) {
    return (
      <div className="flex flex-col gap-2">
        {info.length > 0 && (
          <nav aria-label="Flags" className="no-scrollbar relative -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
            {info.map((f, i) => <Chip key={`${i}-${f.target}`} f={f} onFlag={onFlag} />)}
          </nav>
        )}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          <Hourglass size={16} className="text-tint-blue" aria-hidden="true" />
          No AI findings yet — checks, damage assessment and risk scoring run when the agent pipeline processes this claim.
        </div>
      </div>
    );
  }
  return (
    <nav aria-label="Flags" className="no-scrollbar relative -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {flags.map((f, i) => <Chip key={`${i}-${f.target}`} f={f} onFlag={onFlag} />)}
      <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-success-bg px-3 text-sm font-medium text-success">
        <CircleCheck size={16} aria-hidden="true" /> {passed} check{passed === 1 ? "" : "s"} passed
      </span>
    </nav>
  );
}
