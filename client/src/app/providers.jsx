import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { queryClient } from "../lib/queryClient";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useEffect } from "react";

const BOOT_KEY = "amc.boot-id";

/** App-wide providers: TanStack Query, Motion (respects prefers-reduced-motion), Sonner toaster. */
export function Providers({ children }) {
  const theme = useUiStore((s) => s.theme);
  const setUser = useAuthStore((s) => s.setUser);
  useEffect(() => {
    // A session from a previous `npm run dev` run (different boot id) is ended first, so the app opens on the login page.
    let fresh = true;
    try { fresh = localStorage.getItem(BOOT_KEY) === __BOOT_ID__; localStorage.setItem(BOOT_KEY, __BOOT_ID__); } catch { /* storage blocked: keep session */ }
    const end = fresh ? Promise.resolve() : fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    end.then(() => fetch("/api/auth/me", { credentials: "include" })).then((r) => r.ok ? r.json() : null).then((d) => setUser(d?.user || null)).catch(() => setUser(null));
  }, [setUser]);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster
          position="bottom-right"
          theme={theme}
          closeButton
          duration={6000}
          toastOptions={{
            style: {
              background: "var(--surface-raised)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--elev-lg)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
            },
          }}
        />
      </MotionConfig>
    </QueryClientProvider>
  );
}
