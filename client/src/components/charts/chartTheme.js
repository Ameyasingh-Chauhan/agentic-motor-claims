// Chart theme derived from the live CSS tokens, so charts always match light/dark mode.

const read = (style, name) => style.getPropertyValue(name).trim();

export function readChartTokens() {
  const s = getComputedStyle(document.documentElement);
  return {
    palette: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => read(s, `--chart-${i}`)),
    text: read(s, "--text"),
    muted: read(s, "--text-muted"),
    subtle: read(s, "--text-subtle"),
    border: read(s, "--border"),
    surface: read(s, "--surface-raised"),
    bg: read(s, "--surface"),
    success: read(s, "--success"),
    warning: read(s, "--warning"),
    danger: read(s, "--danger"),
    neutral: read(s, "--neutral-flag"),
    font: read(s, "--font-sans") || "Inter Variable, sans-serif",
  };
}

/** Base option fragment applied under every chart's own option. */
export function baseOption(t, reducedMotion) {
  const axis = {
    axisLine: { lineStyle: { color: t.border } },
    axisTick: { show: false },
    axisLabel: { color: t.subtle, fontSize: 12, fontFamily: t.font },
    splitLine: { lineStyle: { color: t.border, type: [4, 4] } },
    nameTextStyle: { color: t.subtle, fontSize: 12 },
  };
  return {
    color: t.palette,
    backgroundColor: "transparent",
    animation: !reducedMotion,
    animationDuration: 800,
    animationEasing: "cubicOut",
    textStyle: { fontFamily: t.font, color: t.muted, fontSize: 12 },
    aria: { enabled: true },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      textStyle: { color: t.text, fontSize: 12, fontFamily: t.font },
      extraCssText: "border-radius:10px;box-shadow:var(--elev-md);padding:8px 12px;",
    },
    legend: { textStyle: { color: t.muted, fontSize: 12 }, icon: "roundRect", itemWidth: 12, itemHeight: 8 },
    xAxis: axis,
    yAxis: axis,
  };
}

/** Deep-merge `extra` into `base` (plain objects only; arrays are replaced). */
export function mergeOption(base, extra) {
  if (Array.isArray(extra) || typeof extra !== "object" || extra === null) return extra;
  const out = { ...base };
  for (const k of Object.keys(extra)) {
    const b = base?.[k];
    const e = extra[k];
    if (Array.isArray(e) && b && !Array.isArray(b) && typeof b === "object") {
      // e.g. xAxis: [{...}, {...}] — apply the base axis style to each entry
      out[k] = e.map((item) => mergeOption(b, item));
    } else if (b && typeof b === "object" && !Array.isArray(b) && typeof e === "object" && !Array.isArray(e)) {
      out[k] = mergeOption(b, e);
    } else {
      out[k] = e;
    }
  }
  return out;
}
