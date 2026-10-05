import { memo, useEffect, useMemo, useRef } from "react";
import ReactEChartsCore from "echarts-for-react/esm/core";
import { echarts } from "./echarts";
import { baseOption, mergeOption, readChartTokens } from "./chartTheme";
import { useUiStore } from "../../store/uiStore";
import { usePrefersReducedMotion } from "../../hooks/useReducedMotion";
import { LAYOUT_RESIZE_EVENT } from "../../lib/motion";
import { cn } from "../../lib/cn";

/**
 * Theme-aware, resize-aware ECharts wrapper.
 * - `option` may be an object or a function `(tokens) => option` so colours come from CSS tokens.
 * - Theme switches re-merge the option in place (no dispose/re-init → no flicker).
 * - Resizes on container ResizeObserver AND the global `layout:resize` event (sidebar toggle end).
 * Height comes from the className (e.g. "h-72") so the box never shifts. `onChartReady(instance)` exposes the ECharts instance
 * (PNG export, zrender-level clicks).
 */
function EChartImpl({ option, className, onEvents, onChartReady, ariaLabel, style }) {
  const ref = useRef(null);
  const boxRef = useRef(null);
  const theme = useUiStore((s) => s.theme);
  const reduced = usePrefersReducedMotion();

  const merged = useMemo(() => {
    const t = readChartTokens();
    const own = typeof option === "function" ? option(t) : option;
    return mergeOption(baseOption(t, reduced), own);
    // theme is a dependency because tokens change with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, theme, reduced]);

  useEffect(() => {
    // echarts-for-react initialises with a fixed width/height, so "auto" is required to re-measure.
    const resize = () => ref.current?.getEchartsInstance()?.resize({ width: "auto", height: "auto", animation: { duration: 0 } });
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(resize);
    });
    if (boxRef.current) ro.observe(boxRef.current);
    window.addEventListener(LAYOUT_RESIZE_EVENT, resize);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener(LAYOUT_RESIZE_EVENT, resize);
    };
  }, []);

  return (
    <div ref={boxRef} className={cn("relative min-w-0", className)} style={style} role="img" aria-label={ariaLabel}>
      <ReactEChartsCore
        ref={ref}
        echarts={echarts}
        option={merged}
        notMerge={false}
        lazyUpdate
        autoResize={false}
        onEvents={onEvents}
        onChartReady={onChartReady}
        opts={{ renderer: "canvas" }}
        style={{ position: "absolute", inset: 0, height: "100%", width: "100%" }}
      />
    </div>
  );
}

const EChart = memo(EChartImpl);
export default EChart;
