import { useCallback, useMemo, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { ChartColumn, Download, FileSpreadsheet, Info, MoreHorizontal, Table2, TrendingUp } from "lucide-react";
import { LazyEChart } from "../../components/charts/LazyEChart";
import { IconButton } from "../../components/ui/Button";
import { DropdownMenu } from "../../components/ui/Popover";
import { Tooltip } from "../../components/ui/Tooltip";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { cardVariants } from "./motion";

function download(name, href) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function toCsv(table) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [table.columns.map((c) => esc(c.label)).join(",")];
  for (const row of table.rows) lines.push(table.columns.map((c) => esc(row[c.key])).join(","));
  return `﻿${lines.join("\n")}`;   // BOM so Excel reads ₹ correctly
}

function DataTableView({ table, height }) {
  return (
    <div className={cn("overflow-auto rounded-md border border-border", height)}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border">
            {table.columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3 py-2 text-caption font-semibold text-muted", c.numeric ? "text-right" : "text-left")}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {table.columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2 text-text", c.numeric && "num text-right")}>{c.format ? c.format(row[c.key]) : row[c.key] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Dashboard chart card (§10.5): title, subtitle, info tooltip, one-line computed insight, menu (Export PNG / CSV, View as table),
 * skeleton, empty and error states. The chart mounts the first time the card scrolls into view, so its entrance animation plays
 * on first view; later filter changes morph in place (option merge). `onItemClick(params)` handles series clicks;
 * `onAxisClick(index)` handles clicks anywhere over a category axis slot (bars and line points are small targets).
 */
export function ChartCard({
  title, subtitle, info, insight, span, loading, error, onRetry, empty, onReset, table, exportName, height = "h-72",
  option, onItemClick, onAxisClick, axis = "x", ariaLabel, aside, below, children, png = true, chartBox = "min-w-0 flex-1", className,
}) {
  const [tableView, setTableView] = useState(false);
  const box = useRef(null);
  const inView = useInView(box, { once: true, margin: "0px 0px -80px 0px" });
  const inst = useRef(null);
  const handlers = useRef({});
  handlers.current = { onItemClick, onAxisClick };

  const onEvents = useMemo(() => ({ click: (p) => handlers.current.onItemClick?.(p) }), []);
  const onChartReady = useCallback((chart) => {
    inst.current = chart;
    chart.getZr().on("click", (e) => {
      if (e.target || !handlers.current.onAxisClick) return;   // series items are handled by onItemClick
      const pt = [e.offsetX, e.offsetY];
      if (!chart.containPixel({ gridIndex: 0 }, pt)) return;
      const [x, y] = chart.convertFromPixel({ gridIndex: 0 }, pt);
      const idx = Math.round(axis === "x" ? x : y);
      if (Number.isFinite(idx) && idx >= 0) handlers.current.onAxisClick(idx);
    });
  }, [axis]);

  const exportPng = () => {
    const chart = inst.current;
    if (!chart) return;
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
    download(`${exportName}.png`, chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: bg }));
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" }));
    download(`${exportName}.csv`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const ready = !loading && !error && !empty;
  const menu = [
    ...(png ? [{ label: "Export PNG", icon: Download, onSelect: exportPng, disabled: !ready || tableView }] : []),
    { label: "Export CSV", icon: FileSpreadsheet, onSelect: exportCsv, disabled: !ready || !table },
    { type: "separator" },
    { label: tableView ? "View as chart" : "View as table", icon: tableView ? ChartColumn : Table2, onSelect: () => setTableView((v) => !v), disabled: !ready || !table },
  ];

  let body;
  if (loading) body = <Skeleton className={cn("w-full", height)} rounded="lg" />;
  else if (error) body = <div className={cn("flex items-center justify-center", height)}><ErrorState compact title={`Couldn't load ${title.toLowerCase()}`} error={error} onRetry={onRetry} /></div>;
  else if (empty) {
    body = (
      <div className={cn("flex items-center justify-center", height)}>
        <EmptyState compact title="No claims match" description="Try a wider date range or fewer filters."
          action={onReset ? <Button size="sm" variant="secondary" onClick={onReset}>Reset filters</Button> : null} />
      </div>
    );
  } else if (tableView && table) body = <DataTableView table={table} height={height} />;
  else if (children) body = children;
  else {
    body = (
      <div className={cn("flex min-w-0 gap-4", aside ? "flex-col items-center 2xl:flex-row" : "items-center")}>
        <div className={chartBox}>
          {inView ? (
            <LazyEChart option={option} onEvents={onEvents} onChartReady={onChartReady} className={cn("w-full", height)} ariaLabel={ariaLabel ?? `${title}. ${insight ?? ""}`} />
          ) : <Skeleton className={cn("w-full", height)} rounded="lg" />}
        </div>
        {aside}
      </div>
    );
    if (below) body = <div className="flex flex-col gap-3">{body}{below}</div>;
  }

  return (
    <motion.section variants={cardVariants} ref={box} aria-label={title}
      className={cn("dash-card flex min-w-0 flex-col rounded-lg border border-border bg-surface p-5 shadow-sm", span, className)}>
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h3 className="truncate text-base font-semibold text-text">{title}</h3>
            {info && (
              <Tooltip content={info}>
                <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-subtle hover:text-text" aria-label={`About: ${title}`}>
                  <Info size={14} aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>
          {subtitle && <p className="truncate text-caption text-muted">{subtitle}</p>}
        </div>
        <DropdownMenu
          trigger={<IconButton icon={MoreHorizontal} label={`${title} options`} size="sm" variant="ghost" tooltip={false} />}
          items={menu}
        />
      </header>
      <p className="mt-2 mb-3 flex min-h-5 items-start gap-2 text-sm text-text">
        {ready && insight ? (
          <>
            <TrendingUp size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-blue-600" />
            <span className="line-clamp-2">{insight}</span>
          </>
        ) : loading ? <Skeleton className="h-4 w-2/3" /> : null}
      </p>
      <div className="flex min-w-0 flex-1 flex-col justify-center">{body}</div>
    </motion.section>
  );
}
