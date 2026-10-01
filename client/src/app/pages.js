import { lazy } from "react";

/**
 * Lazy page registry. Each loader is shared by React.lazy and by hover-prefetch (sidebar/links),
 * so a prefetched chunk is reused instantly on navigation (§8.2).
 */
export const loaders = {
  home: () => import("../features/home/HomePage"),
  dashboard: () => import("../features/dashboard/DashboardPage"),
  fileClaim: () => import("../features/file-claim/FileClaimPage"),
  whatsapp: () => import("../features/whatsapp/WhatsAppJourneyPage"),
  support: () => import("../features/support/SupportPage"),
  profile: () => import("../features/settings/ProfilePage"),
  settings: () => import("../features/settings/SettingsPage"),
  dev: () => import("../features/dev/DevToolsPage"),
  styleguide: () => import("../features/styleguide/StyleguidePage"),
  notFound: () => import("../features/errors/NotFoundPage"),
};

export const pages = Object.fromEntries(Object.entries(loaders).map(([k, load]) => [k, lazy(load)]));

const prefetched = new Set();
/** Prefetch a page chunk (idempotent). */
export function prefetchPage(key) {
  if (!loaders[key] || prefetched.has(key)) return;
  prefetched.add(key);
  loaders[key]().catch(() => prefetched.delete(key));
}
