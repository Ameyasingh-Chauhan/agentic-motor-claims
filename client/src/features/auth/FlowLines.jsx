import { useEffect, useState } from "react";

// Seven gentle curves across the form panel, in a 1000×1000 user space stretched to the panel.
const PATHS = Array.from({ length: 7 }, (_, i) => {
  const y = 70 + i * 140;
  return `M -40 ${y} C 220 ${y - 110 + i * 12}, 420 ${y + 150 - i * 18}, 640 ${y + 10} S 900 ${y - 90 + i * 10}, 1040 ${y + 40}`;
});
const TIMING = [
  { dur: "11s", delay: "0s" }, { dur: "14s", delay: "-6s" }, { dur: "9s", delay: "-3s" }, { dur: "13s", delay: "-9s" },
  { dur: "10s", delay: "-1s" }, { dur: "15s", delay: "-11s" }, { dur: "12s", delay: "-4s" },
];

/**
 * Flowing lines behind the login form (§10.1). One horizontal userSpaceOnUse gradient spans the whole panel —
 * orange 0–40%, blue 60–100% — so lines read orange left of the card and blue to its right. A soft band (mask
 * translated with CSS transform only) slides along each line. Paused while the tab is hidden; static with
 * reduced motion (login.css).
 */
export function FlowLines() {
  const [paused, setPaused] = useState(() => document.hidden);
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <svg
      className="login-flow pointer-events-none absolute inset-0 h-full w-full"
      data-paused={paused}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="flow-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
          <stop offset="0" style={{ stopColor: "var(--orange-500)" }} />
          <stop offset="0.4" style={{ stopColor: "var(--orange-500)" }} />
          <stop offset="0.6" style={{ stopColor: "var(--blue-600)" }} />
          <stop offset="1" style={{ stopColor: "var(--blue-600)" }} />
        </linearGradient>
        <linearGradient id="flow-band-fill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {TIMING.map((t, i) => (
          <mask key={i} id={`flow-mask-${i}`} maskUnits="userSpaceOnUse" x="-100" y="-100" width="1200" height="1200">
            <rect
              className="flow-band"
              x="0"
              y="-100"
              width="320"
              height="1200"
              fill="url(#flow-band-fill)"
              style={{ "--flow-dur": t.dur, "--flow-delay": t.delay }}
            />
          </mask>
        ))}
      </defs>
      {PATHS.map((d, i) => (
        <g key={i} stroke="url(#flow-stroke)">
          <path className="flow-base" d={d} fill="none" vectorEffect="non-scaling-stroke" />
          <g mask={`url(#flow-mask-${i})`}>
            <path className="flow-glow" d={d} fill="none" vectorEffect="non-scaling-stroke" />
            <path className="flow-hi" d={d} fill="none" vectorEffect="non-scaling-stroke" />
          </g>
        </g>
      ))}
    </svg>
  );
}
