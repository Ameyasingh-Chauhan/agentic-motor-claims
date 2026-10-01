import { motion, useReducedMotion } from "motion/react";
import { riskBand } from "../../lib/format";
import { FLAG_LEVELS } from "./StatusFlag";
import { cn } from "../../lib/cn";

// Geometry: semicircle centred at (100,100), radius 80, from 180° (left) to 0° (right).
const R = 80;
const CX = 100;
const CY = 100;
const polar = (score) => {
  const a = Math.PI * (1 - score / 100);
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
};
const arc = (from, to) => {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
};

const BANDS = [
  { from: 0, to: 29, color: "var(--success)" },
  { from: 30, to: 70, color: "var(--warning)" },
  { from: 71, to: 100, color: "var(--danger)" },
];

/**
 * RiskGauge (§7): semicircle 0–100 with the three bands (0–29 / 30–70 / 71–100), needle animates
 * from 0 (transform rotate only), score + band label with icon (never colour alone).
 */
export function RiskGauge({ score, size = "md", className, label = "Risk score" }) {
  const reduced = useReducedMotion();
  const band = riskBand(score);
  const cfg = FLAG_LEVELS[band.level];
  const Icon = cfg.icon;
  const angle = score == null ? -90 : -90 + (score / 100) * 180;

  return (
    <figure className={cn("flex flex-col items-center", size === "sm" ? "w-40" : "w-56", className)} aria-label={`${label}: ${score ?? "pending"} of 100, ${band.label}`}>
      <svg viewBox="0 0 200 116" className="w-full" aria-hidden="true">
        {BANDS.map((b) => (
          <path key={b.from} d={arc(b.from + (b.from ? 0.8 : 0), b.to + (b.to < 100 ? 0.2 : 0))} stroke={b.color} strokeWidth="14" fill="none" strokeLinecap="butt" opacity="0.9" />
        ))}
        {[0, 30, 71, 100].map((t) => {
          const [x, y] = polar(t);
          const [ix, iy] = [CX + (x - CX) * 0.74, CY + (y - CY) * 0.74];
          return (
            <text key={t} x={ix} y={iy + 4} textAnchor="middle" fontSize="12" fill="var(--text-subtle)" className="num">
              {t}
            </text>
          );
        })}
        {/* The transparent rect mirrors the needle below the hub, so the group's bounding-box centre
            (Motion's default SVG transform origin) is exactly the pivot. */}
        <motion.g
          initial={{ rotate: -90 }}
          animate={{ rotate: angle }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 14, delay: 0.15 }}
        >
          <rect x={CX - 4} y={CY} width="8" height={R - 8} fill="transparent" />
          <path d={`M ${CX - 4} ${CY} L ${CX} ${CY - R + 8} L ${CX + 4} ${CY} Z`} fill="var(--text)" />
        </motion.g>
        <circle cx={CX} cy={CY} r="8" fill="var(--surface)" stroke="var(--text)" strokeWidth="3" />
      </svg>
      <figcaption className="-mt-2 flex flex-col items-center gap-1">
        <span className="num text-3xl text-text">{score ?? "—"}</span>
        <span className={cn("inline-flex h-6 items-center gap-1 rounded-sm px-2 text-caption", cfg.cls)}>
          <Icon size={14} aria-hidden="true" />
          {band.label}
        </span>
      </figcaption>
    </figure>
  );
}
