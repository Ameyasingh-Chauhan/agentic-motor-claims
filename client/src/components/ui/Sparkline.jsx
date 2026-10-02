import { useId, useMemo } from "react";
import { cn } from "../../lib/cn";

const TONES = {
  blue: "var(--tint-blue)",
  navy: "var(--tint-navy)",
  orange: "var(--orange-500)",
  success: "var(--success)",
  danger: "var(--danger)",
  amber: "var(--warning)",
};

const W = 100;
const H = 32;
const PAD = 3; // keeps the stroke inside the box at the extremes

/** Monotone-ish smoothing: Catmull-Rom → cubic Bézier with a gentle tension (no overshoot past neighbours). */
function smoothPath(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1y = Math.min(Math.max(p1[1] + (p2[1] - p0[1]) * t, Math.min(p1[1], p2[1])), Math.max(p1[1], p2[1]));
    const c2y = Math.min(Math.max(p2[1] - (p3[1] - p1[1]) * t, Math.min(p1[1], p2[1])), Math.max(p1[1], p2[1]));
    d += ` C ${p1[0] + (p2[0] - p0[0]) * t} ${c1y}, ${p2[0] - (p3[0] - p1[0]) * t} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/**
 * Smooth area sparkline as inline SVG (no chart engine, never escapes its box). `tone` picks the accent token
 * ("blue" | "navy" | "orange" | "success" | "danger" | "amber"). Fixed height → no layout shift.
 */
export function Sparkline({ data = [], tone = "blue", className, ariaLabel = "Trend" }) {
  const id = useId().replace(/:/g, "");
  const color = TONES[tone] ?? TONES.blue;
  const { line, area } = useMemo(() => {
    const values = data.map(Number).filter((v) => Number.isFinite(v));
    if (values.length < 2) return { line: "", area: "" };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [
      (i / (values.length - 1)) * W,
      max === min ? H / 2 : PAD + (1 - (v - min) / span) * (H - PAD * 2),
    ]);
    const l = smoothPath(pts);
    return { line: l, area: `${l} L ${W} ${H} L 0 ${H} Z` };
  }, [data]);

  return (
    <svg
      className={cn("block h-10 w-full overflow-hidden", className)}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.24 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#spark-${id})`} stroke="none" />}
      {line && <path d={line} fill="none" style={{ stroke: color }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
