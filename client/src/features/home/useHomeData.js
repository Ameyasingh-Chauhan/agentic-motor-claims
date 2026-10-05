import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { prefetchPage } from "../../app/pages";

/** Claims-browser filters that live in the URL (§8.6). `view`/`page_size` are UI-only but also persisted. */
export const FILTER_KEYS = ["q", "status", "segment", "vehicle_type", "claim_type", "city", "risk_band", "min_amount", "max_amount", "from", "to"];
/** Extra list filters a Dashboard drill-down can set (§10.5); shown as removable pills, cleared by "Clear all". */
export const DRILL_KEYS = ["channel", "garage_type", "garage", "city_tier", "dow", "hour", "rule", "min_risk", "max_risk", "outcome", "route", "date_on"];
const URL_FILTERS = [...FILTER_KEYS, ...DRILL_KEYS];
export const DEFAULT_SORT = "created_at:desc";

export function useBrowserState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => {
    const out = Object.fromEntries(URL_FILTERS.map((k) => [k, params.get(k) || ""]));
    out.sort = params.get("sort") || DEFAULT_SORT;
    out.view = params.get("view") === "cards" ? "cards" : "table";
    out.page = Math.max(1, Number(params.get("page")) || 1);
    out.page_size = [25, 50, 100].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 25;
    return out;
  }, [params]);

  /**
   * Merge a patch into the URL. Any filter change resets to page 1. `replace` avoids history spam while typing.
   * `flushSync`: commit immediately instead of as an interruptible transition (the hero pipeline's frequent state
   * updates would otherwise keep restarting it and filter changes would lag ~0.5 s).
   */
  const update = useCallback((patch, { replace = false } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v == null || (k === "sort" && v === DEFAULT_SORT) || (k === "view" && v === "table") || (k === "page" && Number(v) === 1)
          || (k === "page_size" && Number(v) === 25)) next.delete(k);
        else next.set(k, String(v));
      }
      if (!("page" in patch)) next.delete("page");
      return next;
    }, { replace, preventScrollReset: true, flushSync: true });
  }, [setParams]);

  const clearFilters = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams();
      for (const k of ["view", "page_size", "sort"]) if (prev.get(k)) next.set(k, prev.get(k));
      return next;
    }, { preventScrollReset: true, flushSync: true });
  }, [setParams]);

  return { state, update, clearFilters };
}

export function useHomeStats() {
  return useQuery({ queryKey: ["stats", "home"], queryFn: () => api("/stats/home") });
}

export function useClaimsList(state) {
  const params = useMemo(() => {
    const p = Object.fromEntries(URL_FILTERS.map((k) => [k, state[k]]));
    return { ...p, sort: state.sort, page: state.page, page_size: state.page_size };
  }, [state]);
  return useQuery({
    queryKey: ["claims", params],
    queryFn: ({ signal }) => api("/claims", { params, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useFacets() {
  return useQuery({ queryKey: ["claims", "facets"], queryFn: () => api("/claims/facets"), staleTime: 5 * 60_000 });
}

/** Hover intent (150 ms) → prefetch the Claim Detail chunk and the claim itself (§8.2). */
export function usePrefetchClaim() {
  const qc = useQueryClient();
  return useCallback((id) => {
    prefetchPage("claimDetail");
    qc.prefetchQuery({ queryKey: ["claim", id], queryFn: () => api(`/claims/${id}`), staleTime: 30_000 });
  }, [qc]);
}

export function exportUrl(state) {
  const p = new URLSearchParams();
  for (const k of URL_FILTERS) if (state[k]) p.set(k, state[k]);
  if (state.sort !== DEFAULT_SORT) p.set("sort", state.sort);
  const qs = p.toString();
  return `/api/claims/export.csv${qs ? `?${qs}` : ""}`;
}
