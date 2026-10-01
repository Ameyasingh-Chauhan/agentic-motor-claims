import { create } from "zustand";
import { LAYOUT_RESIZE_EVENT } from "../lib/motion";

// Keys are shared with the inline script in index.html (no-flash theme + sidebar).
const THEME_KEY = "amc-theme";
const SIDEBAR_KEY = "amc-sidebar-collapsed";
const DENSITY_KEY = "amc-density";

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — preference just won't persist */
  }
};

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const resolveTheme = (pref) => (pref === "dark" || (pref === "system" && systemDark()) ? "dark" : "light");

function applyTheme(resolved) {
  document.documentElement.setAttribute("data-theme", resolved);
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const useUiStore = create((set, get) => ({
  themePreference: read(THEME_KEY, "system"), // light | dark | system
  theme: document.documentElement.getAttribute("data-theme") || "light", // resolved
  sidebarCollapsed: read(SIDEBAR_KEY, "0") === "1",
  mobileNavOpen: false,
  density: read(DENSITY_KEY, "comfortable"),

  /**
   * Set theme preference. When `origin` ({x, y}) is given and View Transitions are supported,
   * reveal the new theme with a circular clip from that point; otherwise a 200 ms crossfade.
   */
  setThemePreference(pref, origin) {
    write(THEME_KEY, pref);
    const resolved = resolveTheme(pref);
    const commit = () => {
      applyTheme(resolved);
      set({ themePreference: pref, theme: resolved });
    };
    if (resolved === get().theme) return set({ themePreference: pref });

    if (prefersReducedMotion() || !document.startViewTransition) {
      commit();
      return;
    }
    const transition = document.startViewTransition(commit);
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    transition.ready
      .then(() => {
        document.documentElement.animate(
          origin
            ? { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }
            : { opacity: [0, 1] },
          {
            duration: origin ? 450 : 200,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {});
  },

  toggleTheme(origin) {
    get().setThemePreference(get().theme === "dark" ? "light" : "dark", origin);
  },

  /** Follow OS changes while preference is "system". */
  syncSystemTheme() {
    if (get().themePreference !== "system") return;
    const resolved = resolveTheme("system");
    applyTheme(resolved);
    set({ theme: resolved });
  },

  setSidebarCollapsed(collapsed) {
    write(SIDEBAR_KEY, collapsed ? "1" : "0");
    if (collapsed) document.documentElement.setAttribute("data-sidebar", "collapsed");
    else document.documentElement.removeAttribute("data-sidebar");
    set({ sidebarCollapsed: collapsed });
  },
  toggleSidebar() {
    get().setSidebarCollapsed(!get().sidebarCollapsed);
  },

  setMobileNavOpen(open) {
    set({ mobileNavOpen: open });
  },

  setDensity(density) {
    write(DENSITY_KEY, density);
    set({ density });
  },
}));

/** Notify charts (and anything else size-dependent) that the layout settled. */
export function dispatchLayoutResize() {
  window.dispatchEvent(new Event(LAYOUT_RESIZE_EVENT));
}
