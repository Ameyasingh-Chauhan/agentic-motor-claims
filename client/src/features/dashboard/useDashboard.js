import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

/** Dashboard filters that live in the URL (§10.5): date preset (or custom from/to) + the five multi-select dimensions. */
export const DIMENSIONS = ["vehicle_type", "claim_type", "city", "channel", "garage_type"];
const KEYS = ["range", "from", "to", ...DIMENSIONS];
export const DEFAULT_RANGE = "fy";

export function useDashboardFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ""])), [params]);

  /** Merge a patch into the URL (empty values are removed; the default preset is implicit). */
  const update = useCallback((patch) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v == null || (k === "range" && v === DEFAULT_RANGE)) next.delete(k);
        else next.set(k, String(v));
      }
      if (next.get("range") && next.get("range") !== "custom") { next.delete("from"); next.delete("to"); }
      return next;
    }, { replace: true, preventScrollReset: true });
  }, [setParams]);

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true, preventScrollReset: true }), [setParams]);
  const active = DIMENSIONS.some((k) => filters[k]) || (filters.range && filters.range !== DEFAULT_RANGE) || Boolean(filters.from);
  return { filters, update, reset, active };
}

export function useDashboard(filters) {
  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);
  return useQuery({
    queryKey: ["stats", "dashboard", params],
    queryFn: ({ signal }) => api("/stats/dashboard", { params, signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** Home claims list (`/#claims`) with the dashboard's filters plus the clicked element's filters. */
export function drillHref(baseLink, link, { dropDates = false } = {}) {
  const merged = { ...(baseLink || {}), ...(link || {}) };
  if (dropDates && !(link && ("from" in link))) { delete merged.from; delete merged.to; }
  const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v !== "" && v != null)).toString();
  return `/?${qs}#claims`;
}
