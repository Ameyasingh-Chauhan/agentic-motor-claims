import { House, ChartNoAxesCombined, FilePlus2, MessageCircle, Wrench, Palette, DatabaseZap } from "lucide-react";
import { can } from "../lib/permissions";

/** Sidebar items in order (§10.2). `page` keys map to lazy loaders for hover prefetch. */
export const NAV_ITEMS = [
  { to: "/", label: "Home", icon: House, page: "home", end: true },
  { to: "/dashboard", label: "Dashboard", icon: ChartNoAxesCombined, page: "dashboard", visible: can.viewDashboard },
  { to: "/file-claim", label: "File a Claim", icon: FilePlus2, page: "fileClaim" },
  { to: "/whatsapp", label: "WhatsApp Journey", icon: MessageCircle, page: "whatsapp" },
];

/** Admin / developer items shown under their own "Admin" divider. */
export const ADMIN_NAV_ITEMS = [
  { to: "/data-manager", label: "Data Manager", icon: DatabaseZap, page: "dataManager", visible: can.manageData },
];

/** Developer-only items shown under a divider. */
export const DEV_NAV_ITEMS = [
  { to: "/dev", label: "Dev Tools", icon: Wrench, page: "dev", visible: can.viewDevTools },
  { to: "/styleguide", label: "Style guide", icon: Palette, page: "styleguide", visible: can.viewStyleguide },
];

export const visibleItems = (items, user) => items.filter((i) => !i.visible || i.visible(user));
