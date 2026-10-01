import { QueryClient } from "@tanstack/react-query";

// §8.3: lists 30 s stale; reference data overrides staleTime to 5 min per query.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, error) => (error?.status >= 400 && error?.status < 500 ? false : count < 2),
      refetchOnWindowFocus: false,
    },
  },
});
