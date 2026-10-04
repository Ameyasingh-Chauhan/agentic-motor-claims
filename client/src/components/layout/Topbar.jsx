import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FlaskConical, Menu, Search } from "lucide-react";
import { BrandLogo } from "../ui/BrandLogo";
import { Avatar } from "../ui/Avatar";
import { Kbd } from "../ui/Kbd";
import { Breadcrumbs } from "./Breadcrumbs";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationsPanel } from "./NotificationsPanel";
import { UserMenu } from "./UserMenu";
import { useShortcutsStore } from "./shortcutsStore";
import { useUiStore } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";
import { formatClock } from "../../lib/format";
import { roleLabel } from "../../lib/permissions";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/Badge";
import { Tooltip } from "../ui/Tooltip";
import { useSystemStatus } from "../../hooks/useSystemStatus";

/** Yellow "Demo mode" badge for admins when AI responses are pre-recorded (no key file, or LLM_MODE=demo) — spec §5. */
function DemoModeBadge() {
  const status = useSystemStatus();
  if (status.data?.llm_mode !== "demo") return null;
  return (
    <Tooltip content="Demo mode — AI responses are pre-recorded">
      <span tabIndex={0} className="rounded-sm"><Badge tone="warning" icon={FlaskConical}>Demo mode</Badge></span>
    </Tooltip>
  );
}

/** Live IST clock, updated every 30 s (aligned to the minute). */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval;
    const tick = () => setNow(new Date());
    const align = setTimeout(() => {
      tick();
      interval = setInterval(tick, 30_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(align);
      clearInterval(interval);
    };
  }, []);
  return (
    <time dateTime={now.toISOString()} className="num hidden text-sm whitespace-nowrap text-muted xl:block">
      {formatClock(now)}
    </time>
  );
}

/**
 * Topbar (64px, sticky, blurred; white — dark: sidebar grey — with a bottom border).
 * Left: menu button (< 1024px), brand (when the sidebar is collapsed or hidden), breadcrumb.
 * Right: clock, search (Ctrl K), notifications, theme toggle, user menu.
 */
export function Topbar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const theme = useUiStore((s) => s.theme);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const openPalette = useShortcutsStore((s) => s.setPaletteOpen);
  const user = useAuthStore((s) => s.user);

  return (
    <header
      className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-sidebar/90 px-6 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
        className="-ml-2 flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-bg-muted hover:text-text lg:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {/* Brand stays visible top-left when the sidebar is collapsed (and always below 1024px). */}
      <div className={cn("flex items-center gap-4", !collapsed && "lg:hidden")}>
        <Link to="/" aria-label="Home" className="inline-flex rounded-sm">
          <BrandLogo variant={theme === "dark" ? "onDark" : "default"} imgClassName="h-auto w-[140px]" />
        </Link>
        <span className="h-6 w-px bg-border" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2">
        {user?.role === "admin" && <DemoModeBadge />}
        <Clock />
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="ml-2 flex h-10 w-64 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm text-subtle transition-colors duration-150 hover:border-subtle hover:text-muted"
          aria-label="Search claims (Ctrl K)"
          aria-keyshortcuts="Control+K"
        >
          <Search size={16} aria-hidden="true" />
          <span className="flex-1 text-left">Search claims…</span>
          <Kbd keys={["Ctrl", "K"]} />
        </button>
        <NotificationsPanel />
        <ThemeToggle />
        {user && (
          <UserMenu
            trigger={
              <button
                type="button"
                aria-label={`Account menu for ${user.display_name}`}
                className="ml-1 flex h-10 items-center gap-2 rounded-md py-1 pr-2 pl-1 transition-colors duration-150 hover:bg-bg-muted"
              >
                <Avatar name={user.display_name} src={user.avatar} size="sm" />
                <span className="hidden flex-col text-left 2xl:flex">
                  <span className="text-sm leading-4 font-semibold text-text">{user.display_name}</span>
                  <span className="text-caption text-subtle">{roleLabel(user)}</span>
                </span>
              </button>
            }
          />
        )}
      </div>
    </header>
  );
}
