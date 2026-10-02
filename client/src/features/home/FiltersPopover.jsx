import { useMemo, useState } from "react";
import { Check, Search, SlidersHorizontal } from "lucide-react";
import { Popover } from "../../components/ui/Popover";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { DateRangePicker } from "../../components/ui/DateRangePicker";
import { cn } from "../../lib/cn";
import { CLAIM_TYPES, RISK_BANDS, VEHICLE_TYPES } from "./constants";

const csv = (s) => (s ? s.split(",").filter(Boolean) : []);
const FIELDS = ["vehicle_type", "claim_type", "city", "risk_band", "min_amount", "max_amount", "from", "to"];

export function activeFilterCount(state) {
  return ["vehicle_type", "claim_type", "city", "risk_band"].reduce((n, k) => n + csv(state[k]).length, 0)
    + (state.min_amount || state.max_amount ? 1 : 0) + (state.from || state.to ? 1 : 0);
}

function ToggleGroup({ label, options, value, onChange }) {
  const selected = csv(value);
  const toggle = (v) => onChange((selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]).join(","));
  return (
    <fieldset>
      <legend className="mb-2 text-caption text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm transition-colors duration-150",
                on ? "border-orange-600 bg-bg-muted text-orange-700" : "border-border text-muted hover:border-border-strong hover:text-text",
              )}
            >
              {on && <Check size={14} aria-hidden="true" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CityList({ cities, value, onChange }) {
  const [q, setQ] = useState("");
  const selected = csv(value);
  const shown = useMemo(() => cities.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase())), [cities, q]);
  const toggle = (c) => onChange((selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]).join(","));
  return (
    <fieldset>
      <legend className="mb-2 text-caption text-muted">City {selected.length > 0 && `· ${selected.length} selected`}</legend>
      <Input size="sm" icon={Search} placeholder="Find a city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a city" />
      <ul className="mt-2 grid max-h-36 grid-cols-2 gap-x-2 overflow-y-auto">
        {shown.map((c) => {
          const on = selected.includes(c);
          return (
            <li key={c}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(c)}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-text hover:bg-bg-muted">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border", on ? "border-primary bg-primary text-on-primary" : "border-border-strong")}>
                  {on && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className="truncate">{c}</span>
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="col-span-2 px-2 py-2 text-caption text-subtle">No matching city</li>}
      </ul>
    </fieldset>
  );
}

/** Filters popover (§10.3 D): edits a draft, applies to the URL on "Apply". No native <select> anywhere. */
export function FiltersPopover({ state, onApply, facets, customer }) {
  const [draft, setDraft] = useState({});
  const count = activeFilterCount(state);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Popover
      placement="bottom-end"
      className="w-104 p-0"
      onOpenChange={(open) => open && setDraft(Object.fromEntries(FIELDS.map((k) => [k, state[k]])))}
      trigger={
        <Button variant="secondary" icon={SlidersHorizontal}>
          Filters
          {count > 0 && <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-caption text-on-primary">{count}</span>}
        </Button>
      }
    >
      {({ close }) => (
        <div>
          <div className="flex flex-col gap-5 p-5">
            <ToggleGroup label="Vehicle type" options={VEHICLE_TYPES} value={draft.vehicle_type} onChange={set("vehicle_type")} />
            <ToggleGroup label="Claim type" options={CLAIM_TYPES} value={draft.claim_type} onChange={set("claim_type")} />
            {!customer && <ToggleGroup label="Risk band" options={RISK_BANDS} value={draft.risk_band} onChange={set("risk_band")} />}
            {!customer && <CityList cities={facets?.cities ?? []} value={draft.city} onChange={set("city")} />}
            <fieldset>
              <legend className="mb-2 text-caption text-muted">Claimed amount (₹)</legend>
              <div className="flex items-center gap-2">
                <Input size="sm" inputMode="numeric" placeholder="Min" aria-label="Minimum amount" value={draft.min_amount ?? ""}
                  onChange={(e) => set("min_amount")(e.target.value.replace(/[^\d]/g, ""))} />
                <span className="text-subtle" aria-hidden="true">–</span>
                <Input size="sm" inputMode="numeric" placeholder="Max" aria-label="Maximum amount" value={draft.max_amount ?? ""}
                  onChange={(e) => set("max_amount")(e.target.value.replace(/[^\d]/g, ""))} />
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-caption text-muted">Date reported</legend>
              <DateRangePicker className="w-full" value={{ from: draft.from || null, to: draft.to || null }}
                onChange={(r) => setDraft((d) => ({ ...d, from: r.from || "", to: r.to || "" }))} />
            </fieldset>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => setDraft(Object.fromEntries(FIELDS.map((k) => [k, ""])))}>Reset</Button>
            <Button size="sm" onClick={() => { onApply(draft); close(true); }}>Apply filters</Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
