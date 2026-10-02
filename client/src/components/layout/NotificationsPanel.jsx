import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
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
export function NotificationsPanel({ notifications: initial = [], unread: initialUnread = 0, onMarkAllRead }) {
  const [notifications, setNotifications] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const navigate = useNavigate();
  useEffect(() => { let alive=true; fetch("/api/notifications", { credentials: "include" }).then((r)=>r.ok?r.json():null).then((d)=>{ if(alive&&d){setNotifications(d.items||[]);setUnread(d.unread||0);} }).catch(()=>{}); return ()=>{alive=false}; }, []);
  const markAll = async () => { await fetch("/api/notifications/read", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({all:true}) }); setNotifications((items)=>items.map((n)=>({...n,read:true}))); setUnread(0); onMarkAllRead?.(); };
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
          onClick={markAll}
        >
          Mark all read
        </Button>
      </div>
      <div className={cn("max-h-96 overflow-y-auto", notifications.length === 0 && "px-4")}>
        {notifications.length === 0 ? (
          <EmptyState compact title="You're all caught up" description="Claim updates, assignments and messages will appear here." />
        ) : (
            notifications.map((n) => (
            <button type="button" key={n.id} onClick={async()=>{if(!n.read) await fetch("/api/notifications/read",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:[n.id]})}); if(n.href) navigate(n.href);}} className="block w-full border-b border-border px-4 py-3 text-left text-sm text-text last:border-0 hover:bg-bg-muted">
              <span className={n.read?"text-muted":"font-semibold"}>{n.title}</span>
            </button>
          ))
        )}
      </div>
    </Popover>
  );
}
