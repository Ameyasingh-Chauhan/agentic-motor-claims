import { TriangleAlert } from "lucide-react";
import { formatHours, formatNumber } from "../../lib/format";
import { cn } from "../../lib/cn";

const TYPE = { authorised: "Authorised", multibrand: "Multi-brand", none: "—" };

function Bar({ value, max, tone = "bg-blue-600" }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-bg-muted" aria-hidden="true">
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${max ? Math.max(4, (100 * value) / max) : 0}%` }} />
    </span>
  );
}

/** Garage leaderboard (§10.5 #16): table with inline bars; ≥ 15 % average overquote is flagged amber (icon + text). Rows drill down. */
export function GarageLeaderboard({ items, onSelect }) {
  const maxVol = Math.max(1, ...items.map((g) => g.volume));
  const maxOq = Math.max(1, ...items.map((g) => g.avg_overquote_pct ?? 0));
  const maxTat = Math.max(1, ...items.map((g) => g.avg_tat_h ?? 0));
  return (
    <div className="h-80 overflow-y-auto">
      <table className="w-full table-fixed text-sm">
        <colgroup><col className="w-[40%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[20%]" /></colgroup>
        <thead>
          <tr className="border-b border-border text-caption text-muted">
            <th scope="col" className="py-2 pr-3 text-left font-semibold">Garage</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">Claims</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">Avg overquote</th>
            <th scope="col" className="py-2 pl-2 text-right font-semibold">Avg turnaround</th>
          </tr>
        </thead>
        <tbody>
          {items.map((g, i) => {
            const high = (g.avg_overquote_pct ?? 0) >= 15;
            return (
              <tr key={g.key} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">
                  <button type="button" onClick={() => onSelect(g.link)} className="flex w-full min-w-0 items-start gap-2 rounded-sm text-left hover:text-blue-600">
                    <span className="num w-5 shrink-0 text-caption text-subtle">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 block font-medium text-text">{g.label}</span>
                      <span className="block truncate text-caption text-muted">{g.city} · {TYPE[g.type] ?? g.type}</span>
                    </span>
                  </button>
                </td>
                <td className="px-2 py-2 text-right">
                  <span className="num font-semibold text-text">{formatNumber(g.volume)}</span>
                  <Bar value={g.volume} max={maxVol} />
                </td>
                <td className="px-2 py-2 text-right">
                  <span className={cn("num inline-flex items-center gap-1", high ? "font-semibold text-warning" : "text-text")}>
                    {high && <TriangleAlert size={12} aria-hidden="true" />}
                    {g.avg_overquote_pct == null ? "—" : `${g.avg_overquote_pct.toFixed(1)}%`}
                    {high && <span className="sr-only">(high)</span>}
                  </span>
                  <Bar value={g.avg_overquote_pct ?? 0} max={maxOq} tone={high ? "bg-warning" : "bg-orange-500"} />
                </td>
                <td className="py-2 pl-2 text-right">
                  <span className="num text-text">{formatHours(g.avg_tat_h)}</span>
                  <Bar value={g.avg_tat_h ?? 0} max={maxTat} tone="bg-tint-navy" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
