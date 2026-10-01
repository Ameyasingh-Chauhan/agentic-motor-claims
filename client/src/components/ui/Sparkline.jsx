import { useCallback } from "react";
import { LazyEChart } from "../charts/LazyEChart";
import { cn } from "../../lib/cn";

/**
 * Mini ECharts line/area for KPI cards. `tone` picks the series colour token
 * ("blue" | "orange" | "success" | "danger"). Fixed height box → no layout shift.
 */
export function Sparkline({ data = [], tone = "blue", className, ariaLabel = "Trend" }) {
  const option = useCallback(
    (t) => {
      const color = { blue: t.palette[0], orange: t.palette[1], success: t.success, danger: t.danger }[tone] ?? t.palette[0];
      return {
        grid: { left: 0, right: 0, top: 2, bottom: 2 },
        xAxis: { type: "category", show: false, boundaryGap: false, data: data.map((_, i) => i) },
        yAxis: { type: "value", show: false, scale: true },
        tooltip: { show: false },
        series: [
          {
            type: "line",
            data,
            smooth: 0.35,
            symbol: "none",
            lineStyle: { width: 2, color },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${color}33` },
                  { offset: 1, color: `${color}00` },
                ],
              },
            },
          },
        ],
      };
    },
    [data, tone],
  );
  return <LazyEChart option={option} className={cn("h-10 w-full", className)} ariaLabel={ariaLabel} />;
}
