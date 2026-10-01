import { useCallback, useMemo, useRef, useState } from "react";
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Rows3, Rows4 } from "lucide-react";
import { Checkbox } from "./Checkbox";
import { Button } from "./Button";
import { DropdownMenu } from "./Popover";
import { Skeleton } from "./Skeleton";
import { EmptyState, ErrorState } from "./EmptyState";
import { useUiStore } from "../../store/uiStore";
import { cn } from "../../lib/cn";

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
});

const EMPTY = [];
const VIRTUAL_THRESHOLD = 50;
const ROW_H = { comfortable: 52, compact: 40 };

const selectColumn = {
  id: "__select",
  enableSorting: false,
  enableHiding: false,
  meta: { width: "w-12", label: "Select" },
  header: ({ table }) => (
    <Checkbox
      aria-label="Select all rows"
      checked={table.getIsAllRowsSelected()}
      indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
      onChange={(v) => table.toggleAllRowsSelected(v)}
    />
  ),
  cell: ({ row }) => (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Checkbox aria-label="Select row" checked={row.getIsSelected()} onChange={(v) => row.toggleSelected(v)} />
    </span>
  ),
};

function toCsv(table) {
  const cols = table.getVisibleLeafColumns().filter((c) => c.id !== "__select");
  const rows = table.getSelectedRowModel().rows.length ? table.getSelectedRowModel().rows : table.getRowModel().rows;
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => esc(c.columnDef.meta?.label ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id)));
  const body = rows.map((r) =>
    cols.map((c) => esc(c.columnDef.meta?.csv ? c.columnDef.meta.csv(r.original) : r.getValue(c.id))).join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function downloadCsv(name, text) {
  const blob = new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Row({ row, table, active, density, onRowClick, onFocusRow, index, measureRef }) {
  return (
    <tr
      ref={measureRef}
      data-index={index}
      tabIndex={active ? 0 : -1}
      aria-selected={row.getIsSelected()}
      onClick={() => onRowClick?.(row.original)}
      onFocus={() => onFocusRow(index)}
      className={cn(
        "border-b border-border transition-colors duration-150",
        onRowClick && "cursor-pointer",
        "hover:bg-bg-muted focus-visible:bg-bg-muted",
        row.getIsSelected() && "bg-bg-muted hover:bg-bg-muted",
      )}
      style={{ height: ROW_H[density] }}
    >
      {row.getVisibleCells().map((cell) => {
        const meta = cell.column.columnDef.meta ?? {};
        return (
          <td
            key={cell.id}
            className={cn("px-4 text-sm whitespace-nowrap text-text", meta.align === "right" && "num text-right", meta.mono && "mono", meta.width)}
          >
            <table.FlexRender cell={cell} />
          </td>
        );
      })}
    </tr>
  );
}

/**
 * DataTable (§7): sortable headers, column-visibility menu, density toggle, sticky header, row hover,
 * row click → detail, keyboard ↑/↓/Home/End/Enter, virtualised when > 50 rows, selection column + CSV export.
 *
 * columns: TanStack column defs. meta: { align: "right", mono, width: "w-32", label, csv: (row) => value }.
 * Four states: `loading` (skeleton rows), `error` (+ onRetry), empty (emptyTitle/emptyDescription/emptyAction), data.
 */
export function DataTable({
  columns,
  data,
  getRowId = (r) => r.id,
  onRowClick,
  selectable = false,
  loading = false,
  error,
  onRetry,
  emptyTitle = "Nothing to show",
  emptyDescription,
  emptyAction,
  exportName = "export.csv",
  title,
  toolbar,
  maxHeight = "max-h-160",
  className,
}) {
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);
  const allColumns = useMemo(() => (selectable ? [selectColumn, ...columns] : columns), [columns, selectable]);
  const table = useTable({
    features,
    columns: allColumns,
    data: data ?? EMPTY,
    getRowId,
    enableRowSelection: selectable,
  });

  const scrollRef = useRef(null);
  const tbodyRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rows = table.getRowModel().rows;
  const virtual = rows.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H[density],
    getItemKey: (i) => rows[i]?.id ?? i,
    overscan: 8,
    enabled: virtual,
  });

  const focusRow = useCallback(
    (i) => {
      const idx = Math.max(0, Math.min(rows.length - 1, i));
      setActiveIndex(idx);
      if (virtual) virtualizer.scrollToIndex(idx, { align: "auto" });
      requestAnimationFrame(() => tbodyRef.current?.querySelector(`tr[data-index="${idx}"]`)?.focus({ preventScroll: virtual }));
    },
    [rows.length, virtual, virtualizer],
  );

  const onKeyDown = (e) => {
    if (e.target.closest("input,button,a") && e.target.tagName !== "TR") return;
    if (e.key === "ArrowDown") (e.preventDefault(), focusRow(activeIndex + 1));
    else if (e.key === "ArrowUp") (e.preventDefault(), focusRow(activeIndex - 1));
    else if (e.key === "Home") (e.preventDefault(), focusRow(0));
    else if (e.key === "End") (e.preventDefault(), focusRow(rows.length - 1));
    else if (e.key === "Enter" && onRowClick && rows[activeIndex]) (e.preventDefault(), onRowClick(rows[activeIndex].original));
    else if (e.key === " " && selectable && rows[activeIndex]) (e.preventDefault(), rows[activeIndex].toggleSelected());
  };

  const visibleCount = table.getVisibleLeafColumns().length;
  const selectedCount = selectable ? table.getSelectedRowModel().rows.length : 0;

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.id !== "__select");
  const columnItems = [
    { type: "label", label: "Show columns" },
    ...hideable.map((c) => ({
      label: c.columnDef.meta?.label ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id),
      checked: c.getIsVisible(),
      keepOpen: true,
      disabled: c.getIsVisible() && table.getVisibleLeafColumns().filter((v) => v.id !== "__select").length === 1,
      onSelect: () => c.toggleVisibility(),
    })),
  ];

  let body;
  if (loading) {
    body = Array.from({ length: 6 }, (_, i) => (
      <tr key={i} className="border-b border-border" style={{ height: ROW_H[density] }}>
        {table.getVisibleLeafColumns().map((c) => (
          <td key={c.id} className="px-4">
            <Skeleton className={cn("h-4", c.columnDef.meta?.align === "right" ? "ml-auto w-16" : "w-3/4")} />
          </td>
        ))}
      </tr>
    ));
  } else if (error || rows.length === 0) {
    body = (
      <tr>
        <td colSpan={visibleCount}>
          {error ? (
            <ErrorState compact error={error} onRetry={onRetry} />
          ) : (
            <EmptyState compact title={emptyTitle} description={emptyDescription} action={emptyAction} />
          )}
        </td>
      </tr>
    );
  } else if (virtual) {
    const items = virtualizer.getVirtualItems();
    const padTop = items.length ? items[0].start : 0;
    const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
    body = (
      <>
        {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }} />}
        {items.map((vi) => (
          <Row
            key={rows[vi.index].id}
            row={rows[vi.index]}
            index={vi.index}
            table={table}
            active={vi.index === activeIndex}
            density={density}
            onRowClick={onRowClick}
            onFocusRow={setActiveIndex}
            measureRef={virtualizer.measureElement}
          />
        ))}
        {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }} />}
      </>
    );
  } else {
    body = rows.map((row, i) => (
      <Row
        key={row.id}
        row={row}
        index={i}
        table={table}
        active={i === activeIndex}
        density={density}
        onRowClick={onRowClick}
        onFocusRow={setActiveIndex}
      />
    ));
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-surface shadow-sm", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {title && <h3 className="mr-auto text-base font-semibold text-text">{title}</h3>}
        {!title && <div className="mr-auto" />}
        {toolbar}
        {selectable && selectedCount > 0 && <span className="num text-caption text-muted">{selectedCount} selected</span>}
        <Button
          variant="secondary"
          size="sm"
          icon={Download}
          disabledReason={loading || rows.length === 0 ? "Nothing to export" : undefined}
          onClick={() => downloadCsv(exportName, toCsv(table))}
        >
          {selectedCount ? "Export selected" : "Export CSV"}
        </Button>
        <DropdownMenu
          trigger={
            <Button variant="secondary" size="sm" icon={Columns3}>
              Columns
            </Button>
          }
          items={columnItems}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={density === "compact" ? Rows3 : Rows4}
          onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
          aria-label={`Row density: ${density}. Switch to ${density === "compact" ? "comfortable" : "compact"}`}
        >
          {density === "compact" ? "Compact" : "Comfortable"}
        </Button>
      </div>
      <div ref={scrollRef} className={cn("overflow-auto", maxHeight)} onKeyDown={onKeyDown}>
        <table className="w-full border-separate border-spacing-0" aria-rowcount={rows.length} aria-busy={loading || undefined}>
          <thead className="sticky top-0 z-10 bg-surface">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta ?? {};
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined}
                      className={cn(
                        "h-10 border-b border-border px-4 text-left text-caption font-semibold text-muted whitespace-nowrap",
                        meta.align === "right" && "text-right",
                        meta.width,
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn("inline-flex items-center gap-1 rounded-sm hover:text-text", meta.align === "right" && "flex-row-reverse")}
                        >
                          <table.FlexRender header={header} />
                          <SortIcon size={14} aria-hidden="true" className={sorted ? "text-blue-700" : "text-subtle"} />
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody ref={tbodyRef}>{body}</tbody>
        </table>
      </div>
      {!loading && !error && rows.length > 0 && (
        <div className="num border-t border-border px-4 py-2 text-caption text-subtle">
          {rows.length.toLocaleString("en-IN")} rows{virtual ? " · virtualised" : ""} · ↑/↓ to move, Enter to open
        </div>
      )}
    </div>
  );
}
