import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { LazyEChart } from "../../components/charts/LazyEChart";
import { Card } from "../../components/ui/Card";
import { ErrorState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatNumber } from "../../lib/format";

// Bucket → semantic colour token (status colours only, §6.1) + legend dot class.
const COLOR = {
  in_progress: ["--chart-1", "bg-blue-600"], c_in_progress: ["--chart-1", "bg-blue-600"],
  needs_action: ["--warning", "bg-warning"], c_needs_input: ["--warning", "bg-warning"],
  siu: ["--danger", "bg-danger"],
  paid: ["--success", "bg-success"], c_paid: ["--success", "bg-success"],
  closed: ["--neutral-flag", "bg-neutral"], c_closed: ["--neutral-flag", "bg-neutral"],
};

/**
 * Claims by status: 5 grouped buckets (a donut stays readable at ≤ 6 slices). Total in the centre; clicking a
 * slice or a legend row filters the claims list. The legend lists every count, so the data never depends on colour.
 */
export function StatusDonut({ buckets, total, loading, error, onRetry }) {
  const navigate = useNavigate();
  const open = useCallback((segment) => navigate(`/?segment=${segment}#claims`), [navigate]);
  const data = useMemo(() => (buckets || []).filter((b) => b.count > 0), [buckets]);

  const option = useCallback((t) => {
    const css = getComputedStyle(document.documentElement);
    return {
      legend: { show: false },
      tooltip: { trigger: "item", formatter: (p) => `${p.name}<br/><b>${formatNumber(p.value)}</b> claims · ${p.percent}%` },
      title: {
        text: formatNumber(total ?? 0), subtext: "claims", left: "center", top: "center", itemGap: 2,
        textStyle: { fontSize: 24, fontWeight: 700, color: t.text, fontFamily: t.font },
        subtextStyle: { fontSize: 12, color: t.muted, fontFamily: t.font },
      },
      series: [{
        type: "pie", radius: ["68%", "92%"], center: ["50%", "50%"], startAngle: 90, avoidLabelOverlap: false,
        padAngle: 2, itemStyle: { borderRadius: 4 }, label: { show: false }, labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 4, label: { show: false } },
        data: data.map((b) => ({ name: b.label, value: b.count, segment: b.segment,
          itemStyle: { color: css.getPropertyValue(COLOR[b.key]?.[0] ?? "--neutral-flag").trim() } })),
      }],
    };
  }, [data, total]);

  const onEvents = useMemo(() => ({ click: (p) => p.data?.segment && open(p.data.segment) }), [open]);

  return (
    <Card title="Claims by status" subtitle="All claims · click to filter" bodyClassName="pt-2">
      {loading ? (
        <div className="flex items-center gap-6"><Skeleton rounded="full" className="h-36 w-36 shrink-0" /><div className="flex-1 space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div></div>
      ) : error ? (
        <ErrorState compact title="Couldn't load status mix" error={error} onRetry={onRetry} />
      ) : (
        <div className="flex flex-col items-center gap-4 2xl:flex-row 2xl:gap-5">
          <LazyEChart option={option} onEvents={onEvents} className="h-36 w-36 shrink-0 cursor-pointer" ariaLabel={`Claims by status, ${total} total`} />
          <ul className="w-full min-w-0 flex-1">
            {data.map((b) => (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => open(b.segment)}
                  className="flex h-7 w-full items-center gap-2 rounded-sm px-1 text-left text-caption transition-colors duration-150 hover:bg-bg-muted"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR[b.key]?.[1] ?? "bg-neutral"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-muted">{b.label}</span>
                  <span className="num font-semibold text-text">{formatNumber(b.count)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
