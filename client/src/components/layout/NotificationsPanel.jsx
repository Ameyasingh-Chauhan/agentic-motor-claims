import { Bell, CheckCheck } from "lucide-react";
import { Popover } from "../ui/Popover";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Tooltip } from "../ui/Tooltip";
import { cn } from "../../lib/cn";

/**
 * Notifications bell + panel. Phase 1 renders the shell (empty state); Phase 3 feeds it from
 * GET /api/notifications with grouping, mark-all-read and click-through navigation.
 */
export function NotificationsPanel({ notifications = [], unread = 0, onMarkAllRead }) {
  return (
    <Popover
      placement="bottom-end"
      className="w-96"
      trigger={
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-bg-muted hover:text-text"
        >
          <Tooltip content="Notifications">
            <Bell size={20} aria-hidden="true" />
          </Tooltip>
          {unread > 0 && (
            <span className="num absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-caption leading-none text-on-primary">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-text">Notifications</h2>
        <Button
          variant="ghost"
          size="sm"
          icon={CheckCheck}
          disabledReason={unread ? undefined : "No unread notifications"}
          onClick={onMarkAllRead}
        >
          Mark all read
        </Button>
      </div>
      <div className={cn("max-h-96 overflow-y-auto", notifications.length === 0 && "px-4")}>
        {notifications.length === 0 ? (
          <EmptyState compact title="You're all caught up" description="Claim updates, assignments and messages will appear here." />
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="border-b border-border px-4 py-3 text-sm text-text last:border-0">
              {n.title}
            </div>
          ))
        )}
      </div>
    </Popover>
  );
}
