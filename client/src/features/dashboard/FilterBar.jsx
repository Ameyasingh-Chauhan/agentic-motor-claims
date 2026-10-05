import { useMemo, useState } from "react";
import { CalendarRange, Check, ChevronDown, RotateCcw, Search } from "lucide-react";
import { DropdownMenu, Popover } from "../../components/ui/Popover";
import { Button, IconButton } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { DateRangePicker } from "../../components/ui/DateRangePicker";
import { Spinner } from "../../components/ui/Spinner";
import { formatDate } from "../../lib/format";
import { cn } from "../../lib/cn";
import { DEFAULT_RANGE, DIMENSIONS } from "./useDashboard";

const PRESETS = [
  { value: "this_month", label: "This month" },
  { value: "last_3m", label: "Last 3 months" },
  { value: "fy", label: "FY to date" },
  { value: "last_fy", label: "Last FY" },
  { value: "last_24m", label: "Last 24 months" },
];
const LABELS = { vehicle_type: "Vehicle", claim_type: "Claim type", city: "City", channel: "Channel", garage_type: "Garage" };
const csv = (s) => (s ? s.split(",").filter(Boolean) : []);

/** Multi-select dimension filter: "Vehicle: All ▾" → checkable list (searchable when long). Empty selection = all. */
function MultiSelect({ name, options, value, onChange }) {
  const [q, setQ] = useState("");
  const selected = csv(value);
  const shown = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())), [options, q]);
  const toggle = (v) => onChange((selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]).join(","));
  const summary = selected.length === 0 ? "All" : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} selected`;
  return (
    <Popover
      placement="bottom-start"
      className="w-64 p-2"
      onOpenChange={(o) => { if (!o) setQ(""); }}
      trigger={(
        <button type="button" className={cn(
          "inline-flex h-9 max-w-52 items-center gap-1 rounded-md border px-2 text-sm transition-colors duration-150",
          selected.length ? "border-accent bg-bg-muted text-text" : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
        )}>
          <span className="text-subtle">{LABELS[name]}:</span>
          <span className={cn("truncate font-medium", selected.length ? "text-orange-700" : "text-text")}>{summary}</span>
          <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
        </button>
      )}
    >
      {options.length > 8 && (
        <Input size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${LABELS[name].toLowerCase()}`} icon={Search} className="mb-2" aria-label={`Search ${LABELS[name]}`} />
      )}
      <ul className="max-h-64 overflow-y-auto" role="listbox" aria-multiselectable="true" aria-label={LABELS[name]}>
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={on} onClick={() => toggle(o.value)}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-text hover:bg-bg-muted">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border", on ? "border-primary bg-primary text-on-primary" : "border-border-strong")}>
                  {on && <Check size={12} aria-hidden="true" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-3 text-caption text-subtle">No matches</li>}
      </ul>
      {selected.length > 0 && (
        <div className="mt-2 border-t border-border pt-2"><Button variant="link" size="sm" onClick={() => onChange("")}>Clear {LABELS[name].toLowerCase()}</Button></div>
      )}
    </Popover>
  );
}

/** Period picker: preset list showing the resolved dates in the trigger, so the sticky bar stays one row. */
function PeriodMenu({ range, period, onChange }) {
  const current = PRESETS.find((p) => p.value === range);
  return (
    <DropdownMenu
      placement="bottom-start"
      trigger={(
        <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-accent bg-bg-muted px-3 text-sm text-text transition-colors duration-150 hover:border-orange-600">
          <CalendarRange size={16} aria-hidden="true" className="text-orange-700" />
          <span className="font-medium text-orange-700">{current?.label ?? "Custom"}</span>
          {period && <span className="num hidden text-muted 2xl:inline">· {formatDate(period.from)} – {formatDate(period.to)}</span>}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
      items={[{ type: "label", label: "Date range (FNOL date)" },
        ...PRESETS.map((p) => ({ label: p.label, checked: p.value === range, onSelect: () => onChange(p.value) }))]}
    />
  );
}

/** Sticky filter bar (§10.5): period presets + custom range, five dimensions, reset — one row at ≥ 1280 px. */
export function FilterBar({ filters, update, reset, active, options, period, fetching }) {
  const range = filters.range || (filters.from ? "custom" : DEFAULT_RANGE);
  return (
    <div className="dash-filterbar sticky z-20 rounded-lg border border-border bg-surface px-3 py-2 shadow-sm" role="region" aria-label="Dashboard filters">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodMenu range={range} period={period} onChange={(v) => update({ range: v })} />
        <DateRangePicker
          label="Custom range" emptyLabel="Custom" className="h-9 rounded-md border-border"
          value={range === "custom" && period ? { from: period.from, to: period.to } : { from: null, to: null }}
          onChange={(v) => (v.from ? update({ range: "custom", from: v.from, to: v.to }) : update({ range: "", from: "", to: "" }))}
        />
        {DIMENSIONS.map((k) => (
          <MultiSelect key={k} name={k} options={options?.[k] ?? []} value={filters[k]} onChange={(v) => update({ [k]: v })} />
        ))}
        <div className="ml-auto flex items-center gap-2">
          {fetching && <span className="inline-flex items-center gap-2 text-caption text-muted" role="status"><Spinner size={14} />Updating</span>}
          <IconButton icon={RotateCcw} label="Reset all filters" size="sm" onClick={reset} disabled={!active} className="disabled:cursor-not-allowed disabled:opacity-40" />
        </div>
      </div>
    </div>
  );
}
