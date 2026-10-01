import { useCallback, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Table2, ChartColumn } from "lucide-react";
import { Section } from "../Section";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { LazyEChart } from "../../../components/charts/LazyEChart";
import { useUiStore } from "../../../store/uiStore";
import { formatINRCompact, formatNumber } from "../../../lib/format";

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const CLAIMS = [182, 205, 231, 214, 248, 266];
const APPROVED = [21.4, 24.9, 27.2, 25.1, 30.6, 33.8].map((v) => v * 1e5);

/** Demo chart for the Phase 1 acceptance check: resizes with the sidebar and re-themes without flicker. */
export function ChartDemo() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const [asTable, setAsTable] = useState(false);

  const option = useCallback(
    (t) => ({
      grid: { left: 48, right: 64, top: 64, bottom: 32 },
      legend: { top: 0, left: 0 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: MONTHS },
      yAxis: [
        { type: "value", name: "Claims", axisLabel: { formatter: (v) => formatNumber(v) } },
        { type: "value", name: "Approved", axisLabel: { formatter: (v) => formatINRCompact(v) }, splitLine: { show: false } },
      ],
      series: [
        { name: "Claims filed", type: "bar", data: CLAIMS, barMaxWidth: 32, itemStyle: { borderRadius: [6, 6, 0, 0], color: t.palette[0] } },
        {
          name: "Amount approved",
          type: "line",
          yAxisIndex: 1,
          data: APPROVED,
          smooth: 0.3,
          symbolSize: 8,
          lineStyle: { width: 3, color: t.palette[1] },
          itemStyle: { color: t.palette[1] },
          tooltip: { valueFormatter: (v) => formatINRCompact(v) },
        },
      ],
    }),
    [],
  );

  return (
    <Section id="charts" title="Charts & layout reflow" description="Toggle the sidebar: its width animates and the content reflows in the same 250 ms, and the chart resizes at the end (layout:resize + ResizeObserver). Switch theme: colours re-merge in place, no re-init.">
      <Card
        title="Claims vs. amount approved (sample)"
        subtitle="Last 6 months"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={asTable ? ChartColumn : Table2} onClick={() => setAsTable((v) => !v)}>
              {asTable ? "View as chart" : "View as table"}
            </Button>
            <Button size="sm" icon={collapsed ? PanelLeftOpen : PanelLeftClose} onClick={toggle}>
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </Button>
          </>
        }
      >
        {asTable ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption text-muted">
                <th className="py-2 font-semibold">Month</th>
                <th className="py-2 text-right font-semibold">Claims filed</th>
                <th className="py-2 text-right font-semibold">Amount approved</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m, i) => (
                <tr key={m} className="border-b border-border">
                  <td className="py-2 text-text">{m} 2026</td>
                  <td className="num py-2 text-right text-text">{formatNumber(CLAIMS[i])}</td>
                  <td className="num py-2 text-right text-text">{formatINRCompact(APPROVED[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <LazyEChart option={option} className="h-80" ariaLabel="Bar chart of claims filed per month with a line of amount approved" />
        )}
      </Card>
      <div className="grid grid-cols-12 gap-6">
        {[3, 3, 6].map((span, i) => (
          <Card key={i} compact className={span === 6 ? "col-span-6" : "col-span-3"} title={`${span} / 12 columns`}>
            <div className="h-12 rounded-md bg-bg-muted" />
          </Card>
        ))}
      </div>
    </Section>
  );
}
