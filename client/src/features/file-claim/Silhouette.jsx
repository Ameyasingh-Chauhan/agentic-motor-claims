/** Outline silhouettes for guided capture (§10.6 step 5). Stroke uses currentColor so the parent sets the colour. */
export function Silhouette({ shape, twoWheeler = false, className }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" };
  let body;
  if (twoWheeler && ["side", "side-r", "front", "rear"].includes(shape)) {
    body = shape.startsWith("side") ? (
      <g {...common} transform={shape === "side-r" ? "translate(200 0) scale(-1 1)" : undefined}>
        <circle cx="48" cy="92" r="18" /><circle cx="150" cy="92" r="18" />
        <path d="M48 92 L70 60 L118 60 L132 40 L146 40 M150 92 L136 56 L118 60 M70 60 L60 44 L92 44" />
        <path d="M96 60 L110 84 L130 84" />
      </g>
    ) : (
      <g {...common}>
        <rect x="88" y="30" width="24" height="14" rx="4" /><path d="M70 30 L130 30 M100 44 L100 100" /><circle cx="100" cy="100" r="10" />
        <rect x="90" y="60" width="20" height="10" rx="2" />
      </g>
    );
  } else if (shape === "side" || shape === "side-r") {
    body = (
      <g {...common} transform={shape === "side-r" ? "translate(200 0) scale(-1 1)" : undefined}>
        <path d="M14 86 L14 70 Q16 62 30 60 L60 56 L82 38 Q88 34 98 34 L138 34 Q146 34 152 40 L170 56 L184 60 Q190 62 190 72 L190 86 Z" />
        <path d="M66 56 L84 42 L116 42 L116 56 Z M122 42 L144 42 L160 56 L122 56 Z" />
        <circle cx="52" cy="88" r="14" /><circle cx="156" cy="88" r="14" />
      </g>
    );
  } else if (shape === "front" || shape === "rear") {
    body = (
      <g {...common}>
        <path d="M56 50 L70 22 Q72 18 80 18 L120 18 Q128 18 130 22 L144 50" />
        <rect x="36" y="50" width="128" height="40" rx="10" />
        {shape === "front" ? <><path d="M44 60 L70 60 L66 70 L44 70 Z M156 60 L130 60 L134 70 L156 70 Z" /><path d="M80 62 L120 62" /></>
          : <><path d="M44 58 L64 58 L64 72 L44 72 Z M156 58 L136 58 L136 72 L156 72 Z" /></>}
        <rect x="82" y="74" width="36" height="10" rx="2" />
        <path d="M44 90 L44 102 L62 102 L62 90 M138 90 L138 102 L156 102 L156 90" />
      </g>
    );
  } else if (shape === "odometer") {
    body = (
      <g {...common}>
        <path d="M46 92 A56 56 0 1 1 154 92" /><path d="M100 82 L128 50" /><circle cx="100" cy="82" r="5" />
        <rect x="76" y="94" width="48" height="14" rx="3" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = Math.PI * (1.05 - i * 0.183); return <path key={i} d={`M${100 + Math.cos(a) * 50} ${82 - Math.sin(a) * 50} L${100 + Math.cos(a) * 42} ${82 - Math.sin(a) * 42}`} />; })}
      </g>
    );
  } else if (shape === "vin") {
    body = (
      <g {...common}>
        <rect x="24" y="40" width="152" height="40" rx="4" /><path d="M36 60 L164 60" strokeDasharray="8 6" />
        <circle cx="32" cy="48" r="2" /><circle cx="168" cy="72" r="2" />
      </g>
    );
  } else {
    body = (
      <g {...common}>
        <path d="M20 34 L20 14 L44 14 M156 14 L180 14 L180 34 M180 86 L180 106 L156 106 M44 106 L20 106 L20 86" />
        <path d="M92 60 L108 60 M100 52 L100 68" />
      </g>
    );
  }
  return <svg viewBox="0 0 200 120" className={className} aria-hidden="true">{body}</svg>;
}
