// Chart builders for the Dashboard (§10.5). Each returns { option(tokens), table, onItemClick?, onAxisClick? }.
// Colours come only from tokens: blue = primary series, orange = highlight, slate = baseline, status colours only for status
// (risk bands, outcomes). Money axes and tooltips use Indian compact format (₹4.2 L / ₹3.1 Cr).
import { formatHours, formatINR, formatINRShort, formatNumber } from "../../lib/format";

export const MORPH = { animationDurationUpdate: 300, animationEasingUpdate: "cubicInOut" };
/** Pie / funnel / sankey / gauge: hide the cartesian axes the shared base theme defines (they would draw stray lines). */
const NO_AXES = { xAxis: { show: false }, yAxis: { show: false } };
const pct = (v) => (v == null ? "—" : `${(Math.round(v * 10) / 10).toFixed(1)}%`);
const num = (v) => (v == null ? "—" : formatNumber(v));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** "#1668dc" + alpha → rgba(); passes other colour strings through. */
export function alpha(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const fade = (c) => ({ type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(c, 0.22) }, { offset: 1, color: alpha(c, 0) }] });
const grid = (extra) => ({ left: 4, right: 12, top: 36, bottom: 4, containLabel: true, ...extra });
const legend = (names) => ({ top: 0, right: 0, data: names, itemGap: 16 });

/** Card-style tooltip body: header + one row per value (marker, label, right-aligned value). */
export function tipRows(header, rows) {
  const body = rows.map((r) => `<div style="display:flex;align-items:center;gap:8px;min-width:180px">${r.marker ?? ""}<span style="flex:1">${esc(r.label)}</span><b style="font-variant-numeric:tabular-nums">${esc(r.value)}</b></div>`).join("");
  return `<div style="font-weight:600;margin-bottom:4px">${esc(header)}</div>${body}`;
}
const axisTip = (fmt) => (ps) => tipRows(ps[0]?.axisValueLabel ?? ps[0]?.name, ps.map((p) => ({ marker: p.marker, label: p.seriesName, value: fmt(p.value, p.seriesIndex) })));

// ------------------------------------------------------------------ Volume

export function filedSettled(d, go) {
  const labels = d.buckets.map((b) => b.label);
  return {
    option: (t) => ({
      ...MORPH,
      legend: legend(["Filed", "Settled / approved"]),
      grid: grid(),
      tooltip: { trigger: "axis", formatter: axisTip((v) => `${num(v)} claims`) },
      xAxis: { type: "category", data: labels, boundaryGap: false, axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        { name: "Filed", type: "line", smooth: 0.3, smoothMonotone: "x", symbol: "circle", symbolSize: 7, showSymbol: labels.length <= 31, data: d.filed,
          lineStyle: { width: 2.5, color: t.palette[0] }, itemStyle: { color: t.palette[0] }, areaStyle: { color: fade(t.palette[0]) },
          emphasis: { focus: "series" } },
        { name: "Settled / approved", type: "line", smooth: 0.3, smoothMonotone: "x", symbol: "circle", symbolSize: 7, showSymbol: labels.length <= 31, data: d.settled,
          lineStyle: { width: 2.5, color: t.palette[1] }, itemStyle: { color: t.palette[1] }, emphasis: { focus: "series" } },
      ],
    }),
    onItemClick: (p) => go(d.links[p.seriesIndex === 1 ? "settled" : "filed"][p.dataIndex]),
    onAxisClick: (i) => d.links.filed[i] && go(d.links.filed[i]),
    table: { columns: [{ key: "period", label: "Period" }, { key: "filed", label: "Filed", numeric: true }, { key: "settled", label: "Settled / approved (by decision date)", numeric: true }],
      rows: d.buckets.map((b, i) => ({ period: `${b.from} – ${b.to}`, filed: d.filed[i], settled: d.settled[i] })) },
  };
}

/** Donut / pie with the total in the centre; legend rendered beside it in React (clickable). `colors` are CSS variable names. */
export function donut(d, colors, go, { pie = false, unit = "claims" } = {}) {
  const items = d.items.filter((i) => i.value > 0);
  return {
    items,
    option: (t) => ({
      ...MORPH,
      ...NO_AXES,
      legend: { show: false },
      tooltip: { trigger: "item", formatter: (p) => tipRows(p.name, [{ marker: p.marker, label: `${num(p.value)} ${unit}`, value: `${p.percent}%` }]) },
      title: pie ? undefined : {
        text: formatNumber(d.total), subtext: unit, left: "center", top: "center", itemGap: 2,
        textStyle: { fontSize: 22, fontWeight: 700, color: t.text, fontFamily: t.font }, subtextStyle: { fontSize: 12, color: t.muted, fontFamily: t.font },
      },
      series: [{
        type: "pie", radius: pie ? ["0%", "88%"] : ["64%", "90%"], center: ["50%", "50%"], startAngle: 90, padAngle: pie ? 1 : 2,
        itemStyle: { borderRadius: pie ? 2 : 4, borderColor: t.bg, borderWidth: pie ? 2 : 0 }, label: { show: false }, labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 4 },
        data: items.map((i) => ({ name: i.label, value: i.value, link: i.link, itemStyle: { color: css(colors[i.key] ?? "--chart-6") } })),
      }],
    }),
    onItemClick: (p) => p.data?.link && go(p.data.link),
    table: { columns: [{ key: "label", label: "Group" }, { key: "value", label: "Claims", numeric: true }, { key: "share", label: "Share", numeric: true }],
      rows: d.items.map((i) => ({ label: i.label, value: i.value, share: d.total ? pct((100 * i.value) / d.total) : "—" })) },
  };
}

export function channelTrend(d, go) {
  const labels = d.buckets.map((b) => b.label);
  const colors = ["palette.0", "palette.1", "palette.2", "palette.5"];
  return {
    option: (t) => ({
      ...MORPH,
      legend: legend(d.series.map((s) => s.label)),
      grid: grid(),
      tooltip: { trigger: "axis", formatter: axisTip((v) => num(v)) },
      xAxis: { type: "category", data: labels, boundaryGap: false, axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", minInterval: 1 },
      series: d.series.map((s, i) => {
        const c = t.palette[Number(colors[i].split(".")[1])];
        return { name: s.label, type: "line", stack: "total", smooth: 0.3, smoothMonotone: "x", symbol: "none", data: s.values, lineStyle: { width: 1.5, color: c },
          itemStyle: { color: c }, areaStyle: { color: alpha(c, 0.32) }, emphasis: { focus: "series" } };
      }),
    }),
    onItemClick: (p) => go(d.series[p.seriesIndex].links[p.dataIndex]),
    onAxisClick: (i) => d.buckets[i] && go({ from: d.buckets[i].from, to: d.buckets[i].to }),
    table: { columns: [{ key: "period", label: "Period" }, ...d.series.map((s) => ({ key: s.key, label: s.label, numeric: true }))],
      rows: d.buckets.map((b, i) => ({ period: `${b.from} – ${b.to}`, ...Object.fromEntries(d.series.map((s) => [s.key, s.values[i]])) })) },
  };
}

// ------------------------------------------------------------------ Money

export function amounts(d, go) {
  const labels = d.buckets.map((b) => b.label);
  const keys = [["claimed", "Claimed", 5], ["approved", "Approved", 0], ["saved", "Saved (fraud + overquote)", 1]];
  return {
    option: (t) => ({
      ...MORPH,
      legend: legend(keys.map((k) => k[1])),
      grid: grid(),
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: axisTip((v) => formatINR(v)) },
      xAxis: { type: "category", data: labels, axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", axisLabel: { formatter: (v) => formatINRShort(v) } },
      series: keys.map(([k, name, ci]) => ({ name, type: "bar", data: d[k], barMaxWidth: 14, barGap: "20%",
        itemStyle: { color: t.palette[ci], borderRadius: [3, 3, 0, 0] }, emphasis: { focus: "series" } })),
    }),
    onItemClick: (p) => go(d.links[keys[p.seriesIndex][0]][p.dataIndex]),
    onAxisClick: (i) => d.links.claimed[i] && go(d.links.claimed[i]),
    table: { columns: [{ key: "period", label: "Period" }, ...keys.map(([k, name]) => ({ key: k, label: `${name} (₹)`, numeric: true, format: formatINR }))],
      rows: d.buckets.map((b, i) => ({ period: `${b.from} – ${b.to}`, claimed: d.claimed[i], approved: d.approved[i], saved: d.saved[i] })) },
  };
}

export function claimSize(d, go) {
  const tierColor = [0, 2, 4];
  return {
    option: (t) => ({
      ...MORPH,
      legend: legend(d.tiers.map((x) => x.label)),
      grid: grid({ right: 56 }),
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps) => tipRows(ps[0].name, ps.map((p) => ({ marker: p.marker, label: `${p.seriesName} · ${num(p.data?.count)} claims`, value: p.value == null ? "—" : formatINR(p.value) }))) },
      xAxis: { type: "value", axisLabel: { formatter: (v) => formatINRShort(v), hideOverlap: true } },
      yAxis: { type: "category", data: d.rows.map((r) => r.label), inverse: true, axisLine: { show: false } },
      series: d.tiers.map((tier, ti) => ({
        name: tier.label, type: "bar", barMaxWidth: 12, barGap: "25%",
        data: d.rows.map((r) => ({ value: r.cells[ti].value, count: r.cells[ti].count, link: r.cells[ti].link })),
        itemStyle: { color: t.palette[tierColor[ti]], borderRadius: [0, 3, 3, 0] }, emphasis: { focus: "series" },
        label: { show: true, position: "right", fontSize: 12, color: t.muted, formatter: (p) => (p.value == null ? "" : formatINRShort(p.value)) },
      })),
    }),
    onItemClick: (p) => p.data?.link && go(p.data.link),
    table: { columns: [{ key: "vehicle", label: "Vehicle" }, ...d.tiers.map((x) => ({ key: `t${x.key}`, label: `${x.label} avg (₹)`, numeric: true, format: (v) => (v == null ? "—" : formatINR(v)) }))],
      rows: d.rows.map((r) => ({ vehicle: r.label, ...Object.fromEntries(d.tiers.map((x, i) => [`t${x.key}`, r.cells[i].value])) })) },
  };
}

// ------------------------------------------------------------------ Fraud

export function fraudTrend(d, go) {
  const labels = d.buckets.map((b) => b.label);
  return {
    option: (t) => ({
      ...MORPH,
      legend: legend(["Fraud savings", "Fraud rate"]),
      grid: grid(),
      tooltip: { trigger: "axis", formatter: axisTip((v, i) => (i === 0 ? formatINR(v) : pct(v))) },
      xAxis: { type: "category", data: labels, axisLabel: { hideOverlap: true } },
      yAxis: [{ type: "value", axisLabel: { formatter: (v) => formatINRShort(v) } },
        { type: "value", axisLabel: { formatter: (v) => `${v}%` }, splitLine: { show: false } }],
      series: [
        { name: "Fraud savings", type: "bar", data: d.savings, barMaxWidth: 18, itemStyle: { color: t.palette[1], borderRadius: [3, 3, 0, 0] }, emphasis: { focus: "series" } },
        { name: "Fraud rate", type: "line", yAxisIndex: 1, data: d.rate, smooth: 0.3, smoothMonotone: "x", symbol: "circle", symbolSize: 7,
          lineStyle: { width: 2.5, color: t.palette[0] }, itemStyle: { color: t.palette[0] }, emphasis: { focus: "series" } },
      ],
    }),
    onItemClick: (p) => go(d.links[p.seriesIndex === 0 ? "savings" : "rate"][p.dataIndex]),
    onAxisClick: (i) => d.links.rate[i] && go(d.links.rate[i]),
    table: { columns: [{ key: "period", label: "Period" }, { key: "savings", label: "Fraud savings (₹)", numeric: true, format: formatINR },
      { key: "count", label: "Fraud detected", numeric: true }, { key: "rate", label: "Fraud rate", numeric: true, format: pct }],
      rows: d.buckets.map((b, i) => ({ period: `${b.from} – ${b.to}`, savings: d.savings[i], count: d.counts[i], rate: d.rate[i] })) },
  };
}

const BAND = { low: ["--success", "Low risk"], medium: ["--warning", "Medium risk"], high: ["--danger", "High risk"] };

export function riskDistribution(d, go) {
  return {
    option: (t) => ({
      ...MORPH,
      grid: grid({ top: 24 }),
      tooltip: { trigger: "item", formatter: (p) => tipRows(`Risk score ${p.name}`, [{ marker: p.marker, label: BAND[p.data.band][1], value: `${num(p.value)} claims` }]) },
      xAxis: { type: "category", data: d.bins.map((b) => b.label), name: "Risk score", nameLocation: "middle", nameGap: 28, axisLabel: { interval: 0 } },
      yAxis: { type: "value", minInterval: 1 },
      series: [{ type: "bar", barCategoryGap: "18%", data: d.bins.map((b) => ({ value: b.value, band: b.band, link: b.link, itemStyle: { color: { low: t.success, medium: t.warning, high: t.danger }[b.band], borderRadius: [3, 3, 0, 0] } })),
        label: { show: true, position: "top", fontSize: 12, color: t.muted, formatter: (p) => (p.value ? p.value : "") } }],
    }),
    onItemClick: (p) => p.data?.link && go(p.data.link),
    onAxisClick: (i) => d.bins[i] && go(d.bins[i].link),
    table: { columns: [{ key: "label", label: "Risk score" }, { key: "band", label: "Band" }, { key: "value", label: "Claims", numeric: true }],
      rows: d.bins.map((b) => ({ label: b.label, band: BAND[b.band][1], value: b.value })) },
  };
}

export function fraudFlags(d, go) {
  const names = d.items.map((i) => `${i.key} · ${i.label}`);
  return {
    option: (t) => ({
      ...MORPH,
      grid: grid({ top: 18, right: 8, left: 0 }),
      tooltip: { trigger: "item", formatter: (p) => tipRows(names[p.dataIndex], [{ marker: p.marker, label: "Claims flagged", value: num(p.value) }]) },
      xAxis: { type: "value", minInterval: 1, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: "category", data: names, inverse: true, axisLine: { show: false }, axisLabel: { show: false } },
      series: [{
        type: "bar", barWidth: 8, barCategoryGap: "55%", showBackground: true, backgroundStyle: { color: t.bgMuted, borderRadius: 4 },
        data: d.items.map((i, k) => ({ value: i.value, link: i.link, itemStyle: { color: k === 0 ? t.palette[1] : t.palette[0], borderRadius: 4 } })),
        label: { show: true, position: [0, -16], width: 260, overflow: "truncate", fontSize: 12, color: t.text, fontFamily: t.font,
          formatter: (p) => `{v|${p.value}}  {n|${names[p.dataIndex]}}`, rich: { n: { color: t.text, fontSize: 12 }, v: { color: t.text, fontSize: 12, fontWeight: 700 } } },
      }],
    }),
    onItemClick: (p) => p.data?.link && go(p.data.link),
    onAxisClick: (i) => d.items[i] && go(d.items[i].link),
    axis: "y",
    table: { columns: [{ key: "key", label: "Rule" }, { key: "label", label: "Name" }, { key: "value", label: "Claims", numeric: true }], rows: d.items },
  };
}

const NODE_COLOR = {
  band: { low: "--success", medium: "--warning", high: "--danger" },
  route: { auto: "--chart-1", handler: "--chart-3", SIU: "--chart-2", pending: "--neutral-flag" },
  outcome: { paid: "--success", declined: "--danger", fraud_confirmed: "--danger", withdrawn: "--neutral-flag", open: "--chart-1" },
};

export function routing(d, go) {
  return {
    option: (t) => ({
      ...MORPH,
      ...NO_AXES,
      tooltip: { trigger: "item", formatter: (p) => (p.dataType === "edge"
        ? tipRows(`${p.data.source} → ${p.data.target}`, [{ label: "Claims", value: num(p.value) }])
        : tipRows(p.name, [{ marker: p.marker, label: "Claims", value: num(p.value) }])) },
      series: [{
        type: "sankey", left: 4, right: 128, top: 8, bottom: 8, nodeWidth: 12, nodeGap: 12, draggable: false, layoutIterations: 32,
        emphasis: { focus: "adjacency" },
        label: { color: t.text, fontSize: 12, fontFamily: t.font, formatter: (p) => `${p.name}  {v|${num(p.value)}}`, rich: { v: { color: t.muted, fontSize: 12 } } },
        lineStyle: { color: "gradient", opacity: 0.42, curveness: 0.5 },
        data: d.nodes.map((n) => ({ name: n.name, link: n.link, itemStyle: { color: css(NODE_COLOR[n.kind][Object.values(n.link)[0]] ?? "--chart-6"), borderWidth: 0 } })),
        links: d.links.map((l) => ({ source: l.source, target: l.target, value: l.value, link: l.link })),
      }],
    }),
    onItemClick: (p) => p.data?.link && go(p.data.link),
    table: { columns: [{ key: "source", label: "From" }, { key: "target", label: "To" }, { key: "value", label: "Claims", numeric: true }], rows: d.links },
  };
}

// ------------------------------------------------------------------ Operations

export function funnel(d, go) {
  const first = d.stages[0]?.value || 1;
  let worst = -1;
  let drop = 0;
  d.stages.forEach((s, i) => {
    if (i === 0 || !d.stages[i - 1].value) return;
    const x = 1 - s.value / d.stages[i - 1].value;
    if (x > drop) { drop = x; worst = i; }
  });
  return {
    option: (t) => ({
      ...MORPH,
      ...NO_AXES,
      tooltip: { trigger: "item", formatter: (p) => {
        const i = p.dataIndex;
        const prev = i > 0 ? d.stages[i - 1].value : null;
        return tipRows(p.name, [{ marker: p.marker, label: "Claims", value: num(p.value) }, { label: "Of FNOL", value: pct((100 * p.value) / first) },
          ...(prev ? [{ label: "From previous stage", value: pct((100 * p.value) / prev) }] : [])]);
      } },
      legend: { show: false },
      series: [{
        type: "funnel", sort: "none", left: "2%", width: "50%", top: 4, bottom: 4, min: 0, max: first, minSize: "18%", gap: 3,
        label: { show: true, position: "right", color: t.text, fontSize: 12, fontFamily: t.font,
          formatter: (p) => `${p.name}
{v|${num(p.value)} · ${Math.round((100 * p.value) / first)}%}`, lineHeight: 16, rich: { v: { color: t.muted, fontSize: 12 } } },
        labelLine: { length: 12, lineStyle: { color: t.border } },
        itemStyle: { borderWidth: 0 },
        emphasis: { label: { fontWeight: 600 } },
        data: d.stages.map((s, i) => ({ name: s.label, value: s.value, link: s.link,
          itemStyle: { color: i === worst ? t.palette[1] : alpha(t.palette[0], 1 - i * 0.14) } })),
      }],
    }),
    onItemClick: (p) => p.data && go(p.data.link),
    table: { columns: [{ key: "label", label: "Stage" }, { key: "value", label: "Claims", numeric: true }, { key: "share", label: "Of FNOL", numeric: true }],
      rows: d.stages.map((s) => ({ label: s.label, value: s.value, share: pct((100 * s.value) / first) })) },
  };
}

export function tat(d, go) {
  return {
    option: (t) => ({
      ...MORPH,
      legend: legend(d.series.map((s) => s.label)),
      grid: grid(),
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps) => tipRows(ps[0].name, ps.map((p) => ({ marker: p.marker, label: `${p.seriesName} · ${num(p.data?.count)} decided`, value: formatHours(p.value) }))) },
      xAxis: { type: "category", data: d.channels.map((c) => c.label) },
      yAxis: { type: "log", logBase: 10, min: (v) => Math.min(0.1, v.min), axisLabel: { formatter: (v) => formatHours(v) } },
      series: d.series.map((s) => ({
        name: s.label, type: "bar", barMaxWidth: 16, barGap: "20%", emphasis: { focus: "series" },
        itemStyle: { color: { low: t.success, medium: t.warning, high: t.danger }[s.key], borderRadius: [3, 3, 0, 0] },
        data: s.values.map((v) => ({ value: v.value, count: v.count, link: v.link })),
      })),
    }),
    onItemClick: (p) => p.data?.link && go(p.data.link),
    table: { columns: [{ key: "channel", label: "Channel" }, ...d.series.map((s) => ({ key: s.key, label: `${s.label} (avg)`, numeric: true, format: formatHours }))],
      rows: d.channels.map((c, i) => ({ channel: c.label, ...Object.fromEntries(d.series.map((s) => [s.key, s.values[i].value])) })) },
  };
}

export function stpGauge(d, go) {
  return {
    option: (t) => ({
      ...MORPH,
      ...NO_AXES,
      series: [{
        type: "gauge", startAngle: 210, endAngle: -30, min: 0, max: 100, radius: "96%", center: ["50%", "58%"],
        progress: { show: true, width: 12, roundCap: true, itemStyle: { color: t.palette[0] } },
        axisLine: { roundCap: true, lineStyle: { width: 12, color: [[1, t.bgMuted]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, anchor: { show: false },
        title: { offsetCenter: [0, "34%"], fontSize: 12, color: t.muted, fontFamily: t.font },
        detail: { offsetCenter: [0, "-2%"], valueAnimation: true, formatter: (v) => `${v.toFixed(1)}%`, fontSize: 26, fontWeight: 700, color: t.text, fontFamily: t.font },
        data: [{ value: d.value, name: "auto-decided" }],
      }],
    }),
    onItemClick: () => go(d.link),
    table: { columns: [{ key: "period", label: "Period" }, { key: "stp", label: "STP rate", numeric: true, format: pct }],
      rows: d.buckets.map((b, i) => ({ period: `${b.from} – ${b.to}`, stp: d.series[i] })) },
  };
}

export function heatmap(d, go) {
  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
  return {
    option: (t) => ({
      ...MORPH,
      grid: grid({ top: 8, right: 8 }),
      tooltip: { trigger: "item", formatter: (p) => tipRows(`${d.days[p.value[1]]} · ${hours[p.value[0]]}:00–${hours[(p.value[0] + 1) % 24]}:00`, [{ label: "FNOLs", value: num(p.value[2]) }]) },
      xAxis: { type: "category", data: hours, splitArea: { show: false }, axisLabel: { interval: 1 } },
      yAxis: { type: "category", data: d.days, inverse: true, axisLine: { show: false } },
      visualMap: { show: false, min: 0, max: Math.max(1, d.max), inRange: { color: [t.bgMuted, alpha(t.palette[0], 0.45), t.palette[0]] } },
      series: [{ type: "heatmap", data: d.cells, itemStyle: { borderColor: t.bg, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: t.palette[1], borderWidth: 2 } } }],
    }),
    onItemClick: (p) => p.value?.[2] && go({ dow: String(p.value[1]), hour: String(p.value[0]) }),
    table: { columns: [{ key: "day", label: "Day" }, ...hours.map((h) => ({ key: h, label: h, numeric: true }))],
      rows: d.days.map((day, di) => ({ day, ...Object.fromEntries(hours.map((h, hi) => [h, d.cells.find((c) => c[0] === hi && c[1] === di)?.[2] ?? 0])) })) },
  };
}

// ------------------------------------------------------------------ Geography & partners

export function cities(d, go) {
  const names = d.items.map((c, i) => `${i + 1}. ${c.label}`);
  return {
    option: (t) => ({
      ...MORPH,
      grid: grid({ top: 4, right: 72 }),
      tooltip: { trigger: "item", formatter: (p) => {
        const c = d.items[p.dataIndex];
        return tipRows(c.label, [{ marker: p.marker, label: "Claims", value: num(c.value) }, { label: "Share", value: pct(c.share) }, { label: "City tier", value: c.tier ? `Tier ${c.tier}` : "—" }]);
      } },
      xAxis: { type: "value", minInterval: 1, axisLabel: { hideOverlap: true } },
      yAxis: { type: "category", data: names, inverse: true, axisLine: { show: false }, axisLabel: { width: 120, overflow: "truncate" } },
      series: [{ type: "bar", barMaxWidth: 14, data: d.items.map((c, i) => ({ value: c.value, link: c.link, itemStyle: { color: i === 0 ? t.palette[1] : t.palette[0], borderRadius: [0, 3, 3, 0] } })),
        label: { show: true, position: "right", fontSize: 12, color: t.muted, formatter: (p) => `${p.value} · ${pct(d.items[p.dataIndex].share)}` } }],
    }),
    onItemClick: (p) => p.data?.link && go(p.data.link),
    onAxisClick: (i) => d.items[i] && go(d.items[i].link),
    axis: "y",
    table: { columns: [{ key: "rank", label: "#" }, { key: "label", label: "City" }, { key: "tier", label: "Tier" }, { key: "value", label: "Claims", numeric: true }, { key: "share", label: "Share", numeric: true, format: pct }],
      rows: d.items.map((c, i) => ({ ...c, rank: i + 1 })) },
  };
}

export const garageTable = (d) => ({
  columns: [{ key: "label", label: "Garage" }, { key: "city", label: "City" }, { key: "type", label: "Type" }, { key: "volume", label: "Claims", numeric: true },
    { key: "avg_overquote_pct", label: "Avg overquote", numeric: true, format: pct }, { key: "avg_tat_h", label: "Avg turnaround", numeric: true, format: formatHours }],
  rows: d.items,
});

// ------------------------------------------------------------------ AI performance

export function agents(d) {
  const ok = d.agents.map((a) => a.success_rate).filter((v) => v != null);
  const floor = ok.length ? Math.max(0, Math.min(90, Math.floor(Math.min(...ok) / 5) * 5 - 5)) : 0;
  return {
    option: (t) => ({
      ...MORPH,
      legend: legend(["Avg latency", "Success rate"]),
      grid: grid(),
      tooltip: { trigger: "axis", formatter: (ps) => tipRows(ps[0].name, [
        ...ps.map((p) => ({ marker: p.marker, label: p.seriesName, value: p.seriesIndex === 0 ? `${p.value ?? "—"} s` : pct(p.value) })),
        { label: "Runs measured", value: num(d.agents[ps[0].dataIndex].runs) }]) },
      xAxis: { type: "category", data: d.agents.map((a) => a.label), axisLabel: { interval: 0, rotate: 30 } },
      yAxis: [{ type: "value", axisLabel: { formatter: (v) => `${v} s` } }, { type: "value", min: floor, max: 100, axisLabel: { formatter: (v) => `${v}%` }, splitLine: { show: false } }],
      series: [
        { name: "Avg latency", type: "bar", barMaxWidth: 22, data: d.agents.map((a) => a.avg_latency_s), itemStyle: { color: t.palette[0], borderRadius: [3, 3, 0, 0] }, emphasis: { focus: "series" } },
        { name: "Success rate", type: "line", yAxisIndex: 1, data: d.agents.map((a) => a.success_rate), symbol: "circle", symbolSize: 7,
          lineStyle: { width: 2.5, color: t.palette[1] }, itemStyle: { color: t.palette[1] }, emphasis: { focus: "series" } },
      ],
    }),
    table: { columns: [{ key: "label", label: "Agent" }, { key: "avg_latency_s", label: "Avg latency (s)", numeric: true }, { key: "success_rate", label: "Success rate", numeric: true, format: pct }, { key: "runs", label: "Runs", numeric: true }],
      rows: d.agents },
  };
}

export function overrides(d, go) {
  const labels = d.buckets.map((b) => b.label);
  return {
    option: (t) => ({
      ...MORPH,
      legend: legend(["Override rate", "Handler decisions"]),
      grid: grid(),
      tooltip: { trigger: "axis", formatter: (ps) => {
        const i = ps[0].dataIndex;
        return tipRows(ps[0].axisValueLabel, [{ marker: ps.find((p) => p.seriesIndex === 0)?.marker, label: "Override rate", value: pct(d.rate[i]) },
          { label: "Overridden", value: `${num(d.overrides[i])} of ${num(d.decisions[i])}` }]);
      } },
      xAxis: { type: "category", data: labels, axisLabel: { hideOverlap: true } },
      yAxis: [{ type: "value", min: 0, max: 100, axisLabel: { formatter: (v) => `${v}%` } }, { type: "value", minInterval: 1, splitLine: { show: false } }],
      series: [
        { name: "Override rate", type: "line", data: d.rate, connectNulls: true, smooth: 0.3, smoothMonotone: "x", symbol: "circle", symbolSize: 7, z: 3,
          lineStyle: { width: 2.5, color: t.palette[0] }, itemStyle: { color: t.palette[0] }, emphasis: { focus: "series" } },
        { name: "Handler decisions", type: "bar", yAxisIndex: 1, data: d.decisions, barMaxWidth: 14, itemStyle: { color: alpha(t.palette[5], 0.35), borderRadius: [3, 3, 0, 0] }, emphasis: { focus: "series" } },
      ],
    }),
    onItemClick: (p) => go(d.links[p.dataIndex]),
    onAxisClick: (i) => d.links[i] && go(d.links[i]),
    table: { columns: [{ key: "period", label: "Period" }, { key: "decisions", label: "Handler decisions", numeric: true }, { key: "overrides", label: "Overridden", numeric: true }, { key: "rate", label: "Override rate", numeric: true, format: pct }],
      rows: d.buckets.map((b, i) => ({ period: `${b.from} – ${b.to}`, decisions: d.decisions[i], overrides: d.overrides[i], rate: d.rate[i] })) },
  };
}

// ------------------------------------------------------------------ Year-on-year

export function yoy(d, go) {
  const fmt = { number: (v) => num(v), inr: (v) => formatINRShort(v) };
  const n = d.metrics.length;
  return {
    option: (t) => ({
      ...MORPH,
      tooltip: { trigger: "item", formatter: (p) => tipRows(d.metrics[p.seriesIndex].label, [{ marker: p.marker, label: p.name, value: d.metrics[p.seriesIndex].format === "inr" ? formatINR(p.value) : num(p.value) }]) },
      title: d.metrics.map((m, i) => {
        const [a, b] = d.periods.map((p) => p.metrics[m.key].value);
        const ch = a ? Math.round(((b - a) / a) * 100) : null;
        return { text: m.label, subtext: ch == null ? "" : `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch)}% vs last FY`, left: `${(100 / n) * i + 2}%`, top: 0,
          textStyle: { fontSize: 14, fontWeight: 600, color: t.text, fontFamily: t.font }, subtextStyle: { fontSize: 12, color: t.muted, fontFamily: t.font } };
      }),
      grid: d.metrics.map((_, i) => ({ left: `${(100 / n) * i + 2}%`, width: `${100 / n - 6}%`, top: 56, bottom: 4, containLabel: true })),
      xAxis: d.metrics.map((_, i) => ({ type: "category", gridIndex: i, data: d.periods.map((p) => (p.key === "this_fy" ? "This FY" : "Last FY")) })),
      yAxis: d.metrics.map((m, i) => ({ type: "value", gridIndex: i, axisLabel: { formatter: fmt[m.format], hideOverlap: true } })),
      series: d.metrics.map((m, i) => ({
        type: "bar", xAxisIndex: i, yAxisIndex: i, barMaxWidth: 36,
        data: d.periods.map((p) => ({ name: p.label, value: p.metrics[m.key].value, link: p.metrics[m.key].link,
          itemStyle: { color: p.key === "this_fy" ? t.palette[0] : t.palette[5], borderRadius: [3, 3, 0, 0] } })),
        label: { show: true, position: "top", fontSize: 12, color: t.text, formatter: (p) => fmt[m.format](p.value) },
      })),
    }),
    onItemClick: (p) => p.data?.link && go(p.data.link),
    table: { columns: [{ key: "label", label: "Period" }, ...d.metrics.map((m) => ({ key: m.key, label: m.label, numeric: true, format: m.format === "inr" ? formatINR : num }))],
      rows: d.periods.map((p) => ({ label: `${p.label} (${p.from} – ${p.to})`, ...Object.fromEntries(d.metrics.map((m) => [m.key, p.metrics[m.key].value])) })) },
  };
}
