import { KpiCard } from "../../components/ui/KpiCard";
import { Tooltip } from "../../components/ui/Tooltip";
import { formatDateTime, formatHours, formatINRShort, formatNumber, formatRelative } from "../../lib/format";
import { KPI_META } from "./constants";
import { Reveal } from "./Reveal";

const FORMAT = {
  number: (v) => formatNumber(Math.round(v)),
  inr: formatINRShort,
  hours: formatHours,
  percent: (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`,
};

export function kpiHref(link) {
  const qs = new URLSearchParams(Object.entries(link || {}).filter(([, v]) => v)).toString();
  return `/?${qs}#claims`;
}

const CUSTOMER_CAPTION = {
  my_claims: "All claims on your policies",
  approved_amount: "Approved or paid to you",
  in_progress: "Being processed now",
};

function PendingBreakdown({ breakdown }) {
  const parts = [
    { key: "INFO_REQUESTED", label: "info", cls: "bg-warning" },
    { key: "UNDER_REVIEW", label: "review", cls: "bg-orange-500" },
    { key: "SIU_INVESTIGATION", label: "SIU", cls: "bg-danger" },
  ];
  const total = parts.reduce((n, p) => n + (breakdown?.[p.key] || 0), 0) || 1;
  return (
    <div className="flex h-10 flex-col justify-end gap-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-bg-muted" aria-hidden="true">
        {parts.map((p) => <span key={p.key} className={p.cls} style={{ width: `${((breakdown?.[p.key] || 0) / total) * 100}%` }} />)}
      </div>
      <p className="truncate text-caption text-muted">
        {parts.map((p, i) => (
          <span key={p.key}>{i > 0 && " · "}<span className="num font-semibold text-text">{breakdown?.[p.key] ?? 0}</span> {p.label}</span>
        ))}
      </p>
    </div>
  );
}

/** KPI grid (§10.3 C): 4 × 2 at ≥ 1280 px, values and deltas from /api/stats/home. */
export function KpiGrid({ kpis, loading, error, onRetry, customer }) {
  const count = customer ? 4 : 8;
  if (loading || error || !kpis) {
    return (
      <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <KpiCard key={i} label="metric" loading={loading || !kpis} error={!loading && error} onRetry={onRetry} />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
      {kpis.map((k, i) => {
        const meta = KPI_META[k.key] ?? {};
        const common = { label: k.label, icon: meta.icon, tone: meta.tone, to: kpiHref(k.link), animateKey: `kpi-${k.key}` };
        let card;
        if (customer) {
          const isDate = k.format === "datetime";
          card = (
            <KpiCard
              {...common}
              value={isDate ? undefined : k.value}
              valueNode={isDate ? (
                <Tooltip content={k.value ? formatDateTime(k.value) : "No updates yet"}><span>{k.value ? formatRelative(k.value) : "—"}</span></Tooltip>
              ) : undefined}
              format={FORMAT[k.format]}
              footer={<p className="flex h-10 items-end text-caption text-muted">{isDate ? (k.value ? formatDateTime(k.value) : "") : CUSTOMER_CAPTION[k.key]}</p>}
            />
          );
        } else {
          card = (
            <KpiCard
              {...common}
              value={k.value}
              format={FORMAT[k.format]}
              delta={k.delta ? k.delta.value : null}
              deltaUnit={k.delta?.unit}
              deltaSemantics={k.delta_semantics}
              spark={k.series}
              footer={k.key === "pending_action" ? <PendingBreakdown breakdown={k.breakdown} /> : undefined}
            />
          );
        }
        return <Reveal key={k.key} index={i + 1} className="min-w-0">{card}</Reveal>;
      })}
    </div>
  );
}
