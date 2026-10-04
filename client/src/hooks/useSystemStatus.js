import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/** GET /api/system/status — LLM mode (live / auto / demo), model, key presence. Refreshed every minute and after a Dev Tools change. */
export function useSystemStatus() {
  return useQuery({ queryKey: ["system", "status"], queryFn: () => api("/system/status"), staleTime: 60_000, refetchInterval: 60_000 });
}
