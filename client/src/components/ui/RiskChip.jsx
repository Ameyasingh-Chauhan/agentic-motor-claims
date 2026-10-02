import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { riskBand } from "../../lib/format";
import { cn } from "../../lib/cn";

const STYLE = {
  low: { cls: "bg-success-bg text-success", icon: CircleCheck },
  medium: { cls: "bg-warning-bg text-warning", icon: TriangleAlert },
  high: { cls: "bg-danger-bg text-danger", icon: CircleX },
};

/**
 * Compact risk score chip (§6.5 bands: 0–29 low, 30–70 medium, 71–100 high): icon + score.
 * The band name is in the accessible label and tooltip so colour is never the only signal.
 */
export function RiskChip({ score, className }) {
  if (score == null) return <span className="text-caption text-subtle">—</span>;
  const band = riskBand(score);
  const s = STYLE[band.key];
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1 rounded-sm px-2 text-caption font-semibold", s.cls, className)}
      title={`${band.label} · score ${score}`}
      aria-label={`${band.label}, score ${score} of 100`}
    >
      <s.icon size={14} aria-hidden="true" />
      <span className="num">{score}</span>
    </span>
  );
}
