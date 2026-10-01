import { Suspense, useEffect, useRef } from "react";
import { useLocation, useOutlet } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsModal } from "./ShortcutsModal";
import { Drawer } from "../ui/Modal";
import { PageSkeleton } from "./PageSkeleton";
import { useUiStore, dispatchLayoutResize } from "../../store/uiStore";
import { useHotkey } from "../../hooks/useHotkeys";
import { pageTransition } from "../../lib/motion";

/**
 * AppShell (§6.4): grid `auto 1fr`. Toggling the sidebar changes --sidebar-w; the sidebar width
 * transitions (250 ms ease-out) and the main content reflows in the same animation.
 * At the end of the transition we dispatch `layout:resize` so every chart resizes.
 */
export function AppShell() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const syncSystemTheme = useUiStore((s) => s.syncSystemTheme);
  const shellRef = useRef(null);
  const sidebarRef = useRef(null);
  const location = useLocation();
  const outlet = useOutlet();

  useHotkey("ctrl+b", toggleSidebar);

  // Follow OS theme changes while the preference is "system".
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", syncSystemTheme);
    return () => mq.removeEventListener("change", syncSystemTheme);
  }, [syncSystemTheme]);

  // Reduced-motion users get no transition → still notify charts after the change.
  useEffect(() => {
    const id = setTimeout(dispatchLayoutResize, 300);
    return () => clearTimeout(id);
  }, [collapsed]);

  // Close the drawer when the viewport grows past 1024px.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e) => e.matches && setMobileNavOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setMobileNavOpen]);

  // Scroll to top on route change (not on query-string changes).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div
      ref={shellRef}
      className="app-shell"
      onTransitionEnd={(e) => {
        if (e.target === sidebarRef.current && e.propertyName === "width") dispatchLayoutResize();
      }}
    >
      <div className="brand-accent-line" aria-hidden="true" />
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-surface focus-visible:px-4 focus-visible:py-2 focus-visible:shadow-lg"
      >
        Skip to content
      </a>
      <aside ref={sidebarRef} className="app-sidebar sticky top-0 hidden h-dvh overflow-hidden border-r border-border bg-sidebar lg:block" aria-label="Sidebar">
        <Sidebar variant="rail" />
      </aside>

      <div className="flex min-w-0 flex-col">
        <Topbar />
        <main id="main" tabIndex={-1} className="flex-1 outline-none" style={{ padding: "var(--page-pad)" }}>
          <div className="mx-auto w-full" style={{ maxWidth: "var(--content-max)" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={location.pathname} {...pageTransition}>
                <Suspense fallback={<PageSkeleton />}>{outlet}</Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} side="left" width="sm">
        <Sidebar variant="drawer" onNavigate={() => setMobileNavOpen(false)} />
      </Drawer>
      <CommandPalette />
      <ShortcutsModal />
    </div>
  );
}
