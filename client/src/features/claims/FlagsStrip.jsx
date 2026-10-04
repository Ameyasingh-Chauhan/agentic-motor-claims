import { CircleCheck, CircleX, Hourglass, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/cn";

const STYLE = {
  fail: { icon: CircleX, cls: "bg-danger-bg text-danger hover:border-danger" },
  warn: { icon: TriangleAlert, cls: "bg-warning-bg text-warning hover:border-warning" },
};

/** Flags strip (§10.4 B): red first, amber next, then a green "checks passed" count. Each chip jumps to its evidence. */
export function FlagsStrip({ flags, passed, pending, onFlag }) {
  if (pending) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
        <Hourglass size={16} className="text-tint-blue" aria-hidden="true" />
        No AI findings yet — checks, damage assessment and risk scoring run when the agent pipeline processes this claim.
      </div>
    );
  }
  return (
    <nav aria-label="Flags" className="no-scrollbar relative -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {flags.map((f, i) => {
        const s = STYLE[f.level];
        return (
          <button key={`${i}-${f.target}`} type="button" onClick={() => onFlag(f)}
            title={`${f.group}: ${f.label} — show the evidence`}
            className={cn("inline-flex h-8 max-w-96 shrink-0 items-center gap-1 rounded-full border border-transparent px-3 text-sm font-medium transition-colors duration-150", s.cls)}>
            <s.icon size={16} aria-hidden="true" className="shrink-0" />
            <span className="sr-only">{f.level === "fail" ? "Critical:" : "Warning:"}</span>
            <span className="truncate">{f.label}</span>
          </button>
        );
      })}
      <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-success-bg px-3 text-sm font-medium text-success">
        <CircleCheck size={16} aria-hidden="true" /> {passed} check{passed === 1 ? "" : "s"} passed
      </span>
    </nav>
  );
}
