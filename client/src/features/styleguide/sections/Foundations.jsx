import { useMemo } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { Section, Demo, Caption } from "../Section";
import { evaluatePairs } from "../../../lib/contrast";
import { useUiStore } from "../../../store/uiStore";
import { formatINR, formatINRCompact, formatDate, formatTime, formatRegistration, formatRelative } from "../../../lib/format";
import { cn } from "../../../lib/cn";

const COLOR_GROUPS = [
  { name: "Surfaces & structure (grey)", tokens: ["--bg", "--bg-subtle", "--surface", "--surface-raised", "--sidebar-bg", "--bg-muted", "--border", "--border-strong"] },
  { name: "Text", tokens: ["--text", "--text-muted", "--text-subtle"] },
  { name: "Brand — orange (brand & action)", tokens: ["--orange-500", "--orange-600", "--orange-700", "--primary", "--accent", "--header-gradient"] },
  { name: "Brand — blue (data & AI)", tokens: ["--brand-blue-start", "--brand-blue-end", "--login-gradient", "--blue-50", "--blue-600", "--blue-700"] },
  { name: "Dark panel & overlays", tokens: ["--panel-dark", "--tooltip-bg", "--overlay"] },
  {
    name: "Status",
    tokens: ["--success", "--success-bg", "--warning", "--warning-bg", "--danger", "--danger-bg", "--neutral-flag", "--neutral-flag-bg", "--focus-ring"],
  },
  { name: "Chart palette (ordered)", tokens: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `--chart-${i}`) },
];

const TYPE_SCALE = [
  ["text-caption", "12 / 16 · 500", "Labels, captions, axes, badges (minimum size)"],
  ["text-sm", "14 / 20 · 400–500", "Tables, dense data, sidebar items"],
  ["text-base", "16 / 24 · 400", "Body text, form inputs"],
  ["text-lg", "18 / 26 · 600", "Card titles"],
  ["text-xl", "20 / 28 · 600", "Section titles"],
  ["text-2xl", "24 / 32 · 600", "Page titles"],
  ["text-3xl", "30 / 38 · 700", "KPI values"],
  ["text-4xl", "36 / 44 · 700", "Home hero title"],
];

const SPACING = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const SPACE_W = { 1: "w-1", 2: "w-2", 3: "w-3", 4: "w-4", 5: "w-5", 6: "w-6", 8: "w-8", 10: "w-10", 12: "w-12", 16: "w-16" };

function Swatch({ token }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="h-12 rounded-md border border-border" style={{ background: `var(${token})` }} />
      <span className="mono text-caption text-muted">{token}</span>
    </div>
  );
}

function ContrastTable() {
  const theme = useUiStore((s) => s.theme);
  const rows = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return evaluatePairs((n) => style.getPropertyValue(n).trim());
    // recompute when the theme changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  const failed = rows.filter((r) => !r.pass).length;
  return (
    <Demo label={`Contrast checks — current theme (${theme}). Run “npm run contrast” to check both themes from tokens.css.`} bodyClassName="p-0">
      <div className={cn("flex items-center gap-2 px-4 py-3 text-sm font-medium", failed ? "text-danger" : "text-success")}>
        {failed ? <CircleX size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
        {failed ? `${failed} pair(s) below minimum` : `All ${rows.length} pairs meet WCAG 2.2 AA`}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-bg-muted">
          <tr className="text-left text-caption text-muted">
            <th className="px-4 py-2 font-semibold">Sample</th>
            <th className="px-4 py-2 font-semibold">Use</th>
            <th className="px-4 py-2 font-semibold">Tokens</th>
            <th className="px-4 py-2 text-right font-semibold">Ratio</th>
            <th className="px-4 py-2 text-right font-semibold">Min</th>
            <th className="px-4 py-2 font-semibold">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="px-4 py-2">
                <span className="inline-flex h-7 items-center rounded-sm px-2 text-sm font-semibold" style={{ color: `var(${r.fg})`, background: `var(${r.bg})` }}>
                  Aa 123
                </span>
              </td>
              <td className="px-4 py-2 text-text">{r.label}</td>
              <td className="mono px-4 py-2 text-caption text-muted">
                {r.fg} / {r.bg}
              </td>
              <td className="num px-4 py-2 text-right text-text">{r.ratio.toFixed(2)}:1</td>
              <td className="num px-4 py-2 text-right text-muted">{r.min}:1</td>
              <td className="px-4 py-2">
                <span className={cn("inline-flex items-center gap-1 text-caption", r.pass ? "text-success" : "text-danger")}>
                  {r.pass ? <CircleCheck size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />}
                  {r.pass ? "Pass" : "Fail"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Demo>
  );
}

export function Foundations() {
  const sample = "2026-09-30T08:44:00Z";
  return (
    <Section id="foundations" title="Foundations" description="Every colour, size, radius and shadow comes from src/styles/tokens.css. Components never use raw hex or arbitrary pixel values.">
      <Demo label="Colour tokens (values follow the current theme)">
        <div className="flex flex-col gap-6">
          {COLOR_GROUPS.map((g) => (
            <div key={g.name}>
              <h3 className="mb-2 text-sm font-semibold text-text">{g.name}</h3>
              <div className="grid grid-cols-3 gap-4 md:grid-cols-6 xl:grid-cols-9">
                {g.tokens.map((t) => (
                  <Swatch key={t} token={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Demo>

      <ContrastTable />

      <Demo label="Typography — Inter Variable (UI) · JetBrains Mono (IDs, registrations, part codes)">
        <div className="flex flex-col divide-y divide-border">
          {TYPE_SCALE.map(([cls, spec, use]) => (
            <div key={cls} className="grid grid-cols-12 items-baseline gap-4 py-3">
              <span className="mono col-span-2 text-caption text-muted">{cls}</span>
              <span className="col-span-2 text-caption text-subtle">{spec}</span>
              <span className={cn("col-span-8 truncate text-text", cls)}>{use}</span>
            </div>
          ))}
          <div className="grid grid-cols-12 items-baseline gap-4 py-3">
            <span className="mono col-span-2 text-caption text-muted">.num</span>
            <span className="col-span-2 text-caption text-subtle">tnum + cv11</span>
            <span className="num col-span-8 text-xl text-text">₹1,25,000 · 11,111 · 98.4%</span>
          </div>
          <div className="grid grid-cols-12 items-baseline gap-4 py-3">
            <span className="mono col-span-2 text-caption text-muted">.mono</span>
            <span className="col-span-2 text-caption text-subtle">JetBrains Mono</span>
            <span className="mono col-span-8 text-base text-text">ABC-MC-2026-000892 · MH 12 AB 1234 · BMP-FR-001</span>
          </div>
        </div>
      </Demo>

      <div className="grid gap-6 xl:grid-cols-2">
        <Demo label="Spacing — 4px grid (4, 8, 12, 16, 20, 24, 32, 40, 48, 64)">
          <div className="flex flex-col gap-2">
            {SPACING.map((n) => (
              <div key={n} className="flex items-center gap-3">
                <span className="num w-10 text-right text-caption text-muted">{n * 4}px</span>
                <span className={cn("h-3 rounded-sm bg-blue-600", SPACE_W[n])} />
              </div>
            ))}
          </div>
        </Demo>
        <Demo label="Radii & elevation">
          <div className="grid grid-cols-3 gap-4">
            {[
              ["rounded-sm", "6 · inputs, badges"],
              ["rounded-md", "10 · buttons"],
              ["rounded-lg", "14 · cards"],
              ["rounded-xl", "20 · modals, hero"],
              ["rounded-full", "full · pills, avatars"],
            ].map(([cls, label]) => (
              <div key={cls} className="flex flex-col gap-1">
                <span className={cn("h-12 border border-border-strong bg-bg-muted", cls)} />
                <Caption>{label}</Caption>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {["shadow-sm", "shadow-md", "shadow-lg"].map((s) => (
              <div key={s} className={cn("flex h-16 items-center justify-center rounded-lg border border-border bg-surface text-caption text-muted", s)}>
                {s}
              </div>
            ))}
          </div>
        </Demo>
      </div>

      <Demo label="Indian formatting (§6.8)">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["Money", formatINR(125000)],
            ["Compact (lakh)", formatINRCompact(420000)],
            ["Compact (crore)", formatINRCompact(31000000)],
            ["Date", formatDate(sample)],
            ["Time (IST)", formatTime(sample)],
            ["Relative", formatRelative(Date.now() - 3 * 60000)],
            ["Registration", formatRegistration("MH12AB1234")],
            ["Claim ID", "ABC-MC-2026-000892"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-caption text-subtle">{k}</dt>
              <dd className={cn("text-base text-text", k === "Registration" || k === "Claim ID" ? "mono" : "num")}>{v}</dd>
            </div>
          ))}
        </dl>
      </Demo>
    </Section>
  );
}
