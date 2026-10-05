import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, LayoutGrid, Search, Table2, X } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button";
import { DropdownMenu } from "../../components/ui/Popover";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { Input } from "../../components/ui/Input";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatDate, formatINR, formatNumber } from "../../lib/format";
import { cn } from "../../lib/cn";
import { ClaimCards } from "./ClaimCards";
import { ClaimsTable } from "./ClaimsTable";
import { CLAIM_TYPES, DRILL_LABELS, RISK_BANDS, SEGMENT_LABELS, VEHICLE_TYPES } from "./constants";
import { FiltersPopover } from "./FiltersPopover";
import { StatusChips } from "./StatusChips";
import { exportUrl, useBrowserState, useClaimsList, useFacets, usePrefetchClaim } from "./useHomeData";

const SORTS = [
  { value: "created_at:desc", label: "Newest first", short: "Newest" },
  { value: "created_at:asc", label: "Oldest first", short: "Oldest" },
  { value: "updated_at:desc", label: "Recently updated", short: "Updated" },
  { value: "amount:desc", label: "Amount: high to low", short: "Amount ↓" },
  { value: "amount:asc", label: "Amount: low to high", short: "Amount ↑" },
  { value: "risk:desc", label: "Risk: high to low", short: "Risk ↓", admin: true },
];
const label = (list, v) => list.find((o) => o.value === v)?.label ?? v;

/** Removable pills for every active filter (incl. KPI/donut segments), so the list never hides why it's narrowed. */
function ActivePills({ state, update, clearFilters }) {
  const pills = [];
  if (state.segment) pills.push({ key: "segment", text: SEGMENT_LABELS[state.segment] ?? state.segment, clear: { segment: "" } });
  for (const [k, list] of [["vehicle_type", VEHICLE_TYPES], ["claim_type", CLAIM_TYPES], ["risk_band", RISK_BANDS]]) {
    for (const v of state[k] ? state[k].split(",") : []) {
      pills.push({ key: `${k}:${v}`, text: k === "risk_band" ? `${label(list, v)} risk` : label(list, v),
        clear: { [k]: state[k].split(",").filter((x) => x !== v).join(",") } });
    }
  }
  for (const v of state.city ? state.city.split(",") : []) {
    pills.push({ key: `city:${v}`, text: v, clear: { city: state.city.split(",").filter((x) => x !== v).join(",") } });
  }
  if (state.min_amount || state.max_amount) {
    pills.push({ key: "amount", text: `${state.min_amount ? formatINR(state.min_amount) : "₹0"} – ${state.max_amount ? formatINR(state.max_amount) : "any"}`, clear: { min_amount: "", max_amount: "" } });
  }
  if (state.from || state.to) {
    pills.push({ key: "date", text: `${state.date_on === "decided" ? "Decided " : ""}${state.from ? formatDate(state.from) : "Start"} – ${state.to ? formatDate(state.to) : "today"}`,
      clear: { from: "", to: "", date_on: "" } });
  }
  if (state.min_risk || state.max_risk) {
    pills.push({ key: "risk", text: `Risk score ${state.min_risk || 0}–${state.max_risk || 100}`, clear: { min_risk: "", max_risk: "" } });
  }
  for (const k of Object.keys(DRILL_LABELS)) {   // Dashboard drill-down filters
    for (const v of state[k] ? state[k].split(",") : []) {
      pills.push({ key: `${k}:${v}`, text: DRILL_LABELS[k](v), clear: { [k]: state[k].split(",").filter((x) => x !== v).join(",") } });
    }
  }
  if (!pills.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pt-3">
      {pills.map((p) => (
        <span key={p.key} className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-bg-muted pr-1 pl-3 text-caption text-text">
          {p.text}
          <button type="button" onClick={() => update(p.clear)} aria-label={`Remove filter ${p.text}`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text">
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      <Button variant="link" size="sm" onClick={clearFilters}>Clear all</Button>
    </div>
  );
}

function SearchBox({ value, onChange }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return undefined;
    const id = setTimeout(() => onChange(text), 200);
    return () => clearTimeout(id);
  }, [text, value, onChange]);
  return (
    <Input
      icon={Search}
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Search ID, name, registration, city"
      aria-label="Search claims"
      className="w-60 min-w-40 shrink"
      trailing={text ? <IconButton icon={X} label="Clear search" size="sm" iconSize={14} tooltip={false} onClick={() => setText("")} /> : null}
    />
  );
}

function Pagination({ data, state, update }) {
  if (!data?.total) return null;
  const pages = Math.max(1, Math.ceil(data.total / state.page_size));
  const from = (state.page - 1) * state.page_size + 1;
  const to = Math.min(data.total, state.page * state.page_size);
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-3 text-sm text-muted">
      <span>Showing <span className="num font-medium text-text">{formatNumber(from)}–{formatNumber(to)}</span> of <span className="num font-medium text-text">{formatNumber(data.total)}</span></span>
      <div className="flex items-center gap-3">
        <SegmentedControl size="sm" label="Rows per page" value={String(state.page_size)} onChange={(v) => update({ page_size: Number(v) })}
          options={[25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))} />
        <span className="num">Page {state.page} of {pages}</span>
        <IconButton icon={ChevronLeft} label="Previous page" variant="secondary" size="sm" disabled={state.page <= 1}
          onClick={() => state.page > 1 && update({ page: state.page - 1 })} />
        <IconButton icon={ChevronRight} label="Next page" variant="secondary" size="sm" disabled={state.page >= pages}
          onClick={() => state.page < pages && update({ page: state.page + 1 })} />
      </div>
    </div>
  );
}

/** Claims browser (§10.3 D): search, filters, sort, status chips, Table/Cards, CSV export, pagination — all URL state. */
export function ClaimsBrowser({ customer }) {
  const { state, update, clearFilters } = useBrowserState();
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useClaimsList(state);
  const { data: facets } = useFacets();
  const prefetch = usePrefetchClaim();
  const sorts = SORTS.filter((s) => !s.admin || !customer);
  const animateRows = (data?.items?.length ?? 0) <= 50;

  const download = () => {
    const a = document.createElement("a");
    a.href = exportUrl(state);
    a.download = "claims.csv";
    a.click();
  };

  return (
    <section id="claims" className="scroll-mt-24 rounded-lg border border-border bg-surface shadow-sm" aria-labelledby="claims-title">
      <header className="flex flex-wrap items-center gap-3 px-6 pt-5">
        <div className="mr-auto flex items-center gap-2">
          <h2 id="claims-title" className="text-xl text-text">{customer ? "My claims" : "Motor claims"}</h2>
          <span className="num inline-flex h-6 items-center rounded-full bg-bg-muted px-2 text-caption text-muted">
            {data ? formatNumber(data.total) : "…"}
          </span>
        </div>
        <SearchBox value={state.q} onChange={(q) => update({ q }, { replace: true })} />
        <FiltersPopover state={state} facets={facets} customer={customer} onApply={(draft) => update(draft)} />
        <DropdownMenu
          trigger={<Button variant="secondary" icon={ArrowDownUp} aria-label={`Sort: ${label(sorts, state.sort)}`}>{sorts.find((s) => s.value === state.sort)?.short ?? "Sort"}</Button>}
          items={[{ type: "label", label: "Sort by" }, ...sorts.map((s) => ({ label: s.label, checked: state.sort === s.value, onSelect: () => update({ sort: s.value }) }))]}
        />
        <SegmentedControl label="View" value={state.view} onChange={(view) => update({ view, page: state.page })}
          options={[{ value: "table", label: "Table", icon: Table2 }, { value: "cards", label: "Cards", icon: LayoutGrid }]} />
        <Button variant="secondary" icon={Download} onClick={download} disabled={!data?.total}>Export CSV</Button>
      </header>

      <ActivePills state={state} update={update} clearFilters={clearFilters} />
      <StatusChips value={state.status} counts={data?.status_counts} allCount={data?.all_count} customer={customer}
        onChange={(status) => update({ status })} />

      <div className={cn("border-t border-border transition-opacity duration-150", isPlaceholderData && "opacity-60")} aria-busy={isPending || isPlaceholderData}>
        {isPending ? (
          <div className="flex flex-col" aria-label="Loading claims">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex h-14 items-center gap-4 border-b border-border px-6">
                <Skeleton className="h-4 w-36" /><Skeleton rounded="full" className="h-8 w-8" /><Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-12" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-28" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState title="Couldn't load claims" error={error} onRetry={refetch} />
        ) : !data.items.length ? (
          <EmptyState
            title={data.all_count ? "No claims match these filters" : "No claims yet"}
            description={data.all_count ? "Try removing a filter or changing your search." : "Claims appear here as soon as they are filed."}
            action={(state.q || state.status || state.segment || data.all_count) ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : null}
          />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
              <motion.div key={state.view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {state.view === "cards"
                  ? <ClaimCards items={data.items} customer={customer} onIntent={prefetch} animateRows={animateRows} />
                  : <ClaimsTable items={data.items} customer={customer} onIntent={prefetch} animateRows={animateRows} />}
              </motion.div>
          </AnimatePresence>
        )}
      </div>
      <Pagination data={data} state={state} update={update} />
    </section>
  );
}
