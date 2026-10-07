import { useRef } from "react";
import { NavLink, useLocation } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandLogo } from "../ui/BrandLogo";
import { Avatar } from "../ui/Avatar";
import { Tooltip } from "../ui/Tooltip";
import { Kbd } from "../ui/Kbd";
import { UserMenu } from "./UserMenu";
import { useUiStore } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";
import { NAV_ITEMS, ADMIN_NAV_ITEMS, DEV_NAV_ITEMS, visibleItems } from "../../app/nav";
import { prefetchPage } from "../../app/pages";
import { roleLabel } from "../../lib/permissions";
import { SPRING } from "../../lib/motion";
import { cn } from "../../lib/cn";

/** Labels fade with opacity only; the width itself is animated by the AppShell grid column. */
function FadeLabel({ show, children, className }) {
  return (
    <span
      className={cn("truncate whitespace-nowrap transition-opacity duration-200", show ? "opacity-100" : "pointer-events-none opacity-0", className)}
      aria-hidden={!show || undefined}
    >
      {children}
    </span>
  );
}

function NavItem({ item, collapsed, onNavigate }) {
  const Icon = item.icon;
  const intent = useRef();
  const { pathname } = useLocation();
  const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);

  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      onPointerEnter={() => {
        intent.current = setTimeout(() => prefetchPage(item.page), 150);
      }}
      onPointerLeave={() => clearTimeout(intent.current)}
      onFocus={() => prefetchPage(item.page)}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-11 w-full items-center gap-3 overflow-hidden rounded-nav pl-4 pr-3 text-sm font-medium transition-colors duration-150",
        active ? "bg-bg-muted text-orange-700" : "text-muted hover:bg-bg-muted hover:text-text",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-indicator"
          transition={SPRING}
          className="absolute top-2 bottom-2 left-0 w-1 rounded-r-full bg-accent"
          aria-hidden="true"
        />
      )}
      <Icon size={20} aria-hidden="true" className="shrink-0" />
      <FadeLabel show={!collapsed}>{item.label}</FadeLabel>
    </NavLink>
  );

  return (
    <li>
      {collapsed ? (
        <Tooltip content={item.label} placement="right" delay={150} className="w-full">
          {link}
        </Tooltip>
      ) : (
        link
      )}
    </li>
  );
}

/**
 * Sidebar (§6.4): logo block (64px) → nav (44px items, sliding indicator) → spacer → user card + collapse.
 * `variant="drawer"` renders the always-expanded version used inside the < 1024px overlay drawer.
 */
export function Sidebar({ variant = "rail", onNavigate }) {
  const storeCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const theme = useUiStore((s) => s.theme);
  const collapsed = variant === "rail" && storeCollapsed;
  const main = visibleItems(NAV_ITEMS, user);
  const sections = [["Admin", visibleItems(ADMIN_NAV_ITEMS, user)], ["Developer", visibleItems(DEV_NAV_ITEMS, user)]].filter(([, items]) => items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center overflow-hidden border-b border-border px-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={collapsed ? "compact" : "full"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="inline-flex"
          >
            <NavLink to="/" aria-label="Home" onClick={onNavigate} className="inline-flex rounded-sm">
              <BrandLogo compact={collapsed} variant={theme === "dark" ? "onDark" : "default"} imgClassName="h-auto w-[168px]" />
            </NavLink>
          </motion.span>
        </AnimatePresence>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {main.map((item) => (
            <NavItem key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </ul>
        {sections.map(([title, items]) => (
          <div key={title}>
            <div className="my-3 flex h-4 items-center gap-2 px-4" role="separator">
              <span className="h-px flex-1 bg-border" />
              <FadeLabel show={!collapsed} className="text-caption text-subtle">
                {title}
              </FadeLabel>
              <span className={cn("h-px bg-border", collapsed ? "w-0" : "flex-1")} />
            </div>
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <NavItem key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border p-3">
        {user && (
          <UserMenu
            placement={collapsed ? "right-end" : "top-start"}
            trigger={
              <button
                type="button"
                aria-label={`Account menu for ${user.display_name}`}
                className="flex h-14 w-full items-center gap-3 overflow-hidden rounded-nav pl-2 pr-2 text-left transition-colors duration-150 hover:bg-bg-muted"
              >
                <Avatar name={user.display_name} src={user.avatar} size="md" />
                <span className={cn("flex min-w-0 flex-1 flex-col transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100")}>
                  <span className="truncate text-sm font-semibold text-text">{user.display_name}</span>
                  <span className="truncate text-caption text-subtle">{roleLabel(user)}</span>
                </span>
                <ChevronsUpDown size={16} aria-hidden="true" className={cn("shrink-0 text-subtle transition-opacity duration-200", collapsed && "opacity-0")} />
              </button>
            }
          />
        )}
        {variant === "rail" && (
          <Tooltip
            content={
              <span className="inline-flex items-center gap-2">
                {collapsed ? "Expand sidebar" : "Collapse sidebar"} <span className="opacity-80">Ctrl+B</span>
              </span>
            }
            placement="right"
            className="w-full"
          >
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className="flex h-11 w-full items-center gap-3 overflow-hidden rounded-nav pl-4 pr-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-bg-muted hover:text-text"
            >
              {collapsed ? <PanelLeftOpen size={20} aria-hidden="true" className="shrink-0" /> : <PanelLeftClose size={20} aria-hidden="true" className="shrink-0" />}
              <FadeLabel show={!collapsed} className="flex flex-1 items-center justify-between">
                Collapse
                <Kbd keys={["Ctrl", "B"]} />
              </FadeLabel>
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
