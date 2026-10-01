// WCAG 2.2 contrast utilities + the token pairs the design system must satisfy.
// Shared by the style guide (live, current theme) and scripts/check-contrast.mjs (both themes, from tokens.css).

/** Parse #rgb/#rrggbb/rgb()/rgba() → [r, g, b, a] (0–255, alpha 0–1). */
export function parseColor(input) {
  const s = String(input).trim().toLowerCase();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  if (s === "white") return [255, 255, 255, 1];
  if (s === "black") return [0, 0, 0, 1];
  throw new Error(`Unsupported colour: ${input}`);
}

/** Composite a (possibly translucent) colour over an opaque background. */
export function flatten(fg, bg) {
  const [r, g, b, a] = fg;
  return [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a), 1];
}

function luminance([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Pairs to verify: [foreground token, background token, minimum ratio, description].
 * 4.5 = normal text, 3 = large text / UI glyphs (focus ring, icons, active indicator).
 * Translucent backgrounds are composited over `--surface`.
 */
export const CONTRAST_PAIRS = [
  ["--text", "--bg", 4.5, "Primary text on background"],
  ["--text", "--surface", 4.5, "Primary text on cards"],
  ["--text", "--sidebar-bg", 4.5, "Text on sidebar / topbar"],
  ["--text-muted", "--surface", 4.5, "Secondary text on cards"],
  ["--text-muted", "--sidebar-bg", 4.5, "Inactive nav items"],
  ["--text-muted", "--bg-muted", 4.5, "Secondary text on hovered row"],
  ["--text-subtle", "--bg", 4.5, "Captions on page canvas"],
  ["--text-subtle", "--surface", 4.5, "Captions on cards"],
  ["--text-subtle", "--surface-raised", 4.5, "Captions in popovers / menus"],
  ["--text-subtle", "--bg-muted", 4.5, "Captions on hovered row"],
  ["--on-primary", "--primary", 4.5, "Primary button label"],
  ["--on-primary", "--primary-hover", 4.5, "Primary button label (hover)"],
  ["--orange-700", "--surface", 4.5, "Orange text / “Edge” wordmark"],
  ["--orange-700", "--sidebar-bg", 4.5, "“Edge” wordmark in header"],
  ["--blue-600", "--surface", 4.5, "Links / info text on cards"],
  ["--blue-600", "--bg", 4.5, "Links on page canvas"],
  ["--orange-700", "--bg-muted", 4.5, "Active navigation and selected controls"],
  ["--blue-700", "--bg-muted", 4.5, "Avatar initials on neutral fill"],
  ["--success", "--success-bg", 4.5, "Green flag"],
  ["--warning", "--warning-bg", 4.5, "Amber flag"],
  ["--danger", "--danger-bg", 4.5, "Red flag"],
  ["--text-muted", "--neutral-flag-bg", 4.5, "Grey flag"],
  ["--danger", "--surface", 4.5, "Error text / outline badge"],
  ["--on-status", "--success", 4.5, "Solid green badge (Settled)"],
  ["--on-status", "--danger", 4.5, "Solid red badge / danger button"],
  ["--tooltip-text", "--tooltip-bg", 4.5, "Tooltip"],
  ["--on-dark", "--panel-dark", 4.5, "Text on dark panel (viewer, WhatsApp under-the-hood)"],
  ["--on-dark-muted", "--panel-dark", 4.5, "Muted text on dark panel"],
  ["--on-dark", "--brand-blue-start", 4.5, "White text on header gradient (start)"],
  ["--on-dark", "--brand-blue-end", 3, "White large text (≥ 18px bold) on header gradient (end)"],
  ["--focus-ring", "--surface", 3, "Focus ring (UI component)"],
  ["--focus-ring", "--sidebar-bg", 3, "Focus ring on sidebar"],
  ["--accent", "--bg-muted", 3, "Orange indicator bar on active nav item"],
  ["--on-primary", "--primary", 3, "Switch / checkbox “on” (UI glyph)"],
  ["--text-subtle", "--surface", 3, "Icons (UI glyph)"],
];

/** Evaluate pairs given a token resolver `get(name) → colour string`. */
export function evaluatePairs(get) {
  const surface = parseColor(get("--surface"));
  return CONTRAST_PAIRS.map(([fgName, bgName, min, label]) => {
    const bg = flatten(parseColor(get(bgName)), surface);
    const fg = flatten(parseColor(get(fgName)), bg);
    const ratio = contrastRatio(fg, bg);
    return { fg: fgName, bg: bgName, min, label, ratio: Math.round(ratio * 100) / 100, pass: ratio >= min };
  });
}
