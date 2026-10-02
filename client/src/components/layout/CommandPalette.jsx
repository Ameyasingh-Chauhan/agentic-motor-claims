import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, History, Search } from "lucide-react";
import { useEscape, useFocusTrap, useScrollLock } from "../../hooks/useOverlay";
import { useHotkey } from "../../hooks/useHotkeys";
import { useShortcutsStore } from "./shortcutsStore";
import { useAuthStore } from "../../store/authStore";
import { NAV_ITEMS, DEV_NAV_ITEMS, visibleItems } from "../../app/nav";
import { Kbd } from "../ui/Kbd";
import { EASE } from "../../lib/motion";
import { cn } from "../../lib/cn";

const RECENT_KEY = "amc-palette-recent";
const readRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
};
const pushRecent = (item) => {
  try {
    const next = [item, ...readRecent().filter((r) => r.to !== item.to)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
};

/**
 * Command palette (Ctrl+K): jump to pages, recent items. Phase 3 adds claim search by ID,
 * customer and registration (results group "Claims").
 */
export function CommandPalette() {
  const open = useShortcutsStore((s) => s.paletteOpen);
  const setOpen = useShortcutsStore((s) => s.setPaletteOpen);
  useHotkey("ctrl+k", () => setOpen(!useShortcutsStore.getState().paletteOpen));

  return createPortal(<AnimatePresence>{open && <PaletteInner onClose={() => setOpen(false)} />}</AnimatePresence>, document.body);
}

function PaletteInner({ onClose }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [claims, setClaims] = useState([]);
  const ref = useRef(null);
  const inputRef = useRef(null);
  useFocusTrap(ref, true, inputRef);
  useEscape(true, onClose);
  useScrollLock(true);
  useEffect(() => { if (!q.trim()) { setClaims([]); return; } let alive=true; const id=setTimeout(()=>fetch(`/api/claims?q=${encodeURIComponent(q)}&page_size=8`,{credentials:"include"}).then((r)=>r.ok?r.json():null).then((d)=>alive&&setClaims(d?.items||[])).catch(()=>{}),200); return ()=>{alive=false;clearTimeout(id)}; }, [q]);

  const groups = useMemo(() => {
    const pages = [...visibleItems(NAV_ITEMS, user), ...visibleItems(DEV_NAV_ITEMS, user)].map((p) => ({
      to: p.to,
      label: p.label,
      icon: p.icon,
      kind: "Pages",
    }));
    const needle = q.trim().toLowerCase();
    const recent = needle ? [] : readRecent().map((r) => ({ ...r, icon: History, kind: "Recent" }));
    const matchPages = pages.filter((p) => !needle || p.label.toLowerCase().includes(needle));
    const claimItems = claims.map((claim) => ({ to: `/claims/${claim.id}`, label: `${claim.id} · ${claim.customer_name || claim.customer_id || "Claim"}`, icon: Search, kind: "Claims" }));
    return [
      ...(recent.length ? [{ name: "Recent", items: recent }] : []),
      ...(matchPages.length ? [{ name: "Pages", items: matchPages }] : []),
      ...(claimItems.length ? [{ name: "Claims", items: claimItems }] : []),
    ];
  }, [q, user, claims]);
  const flat = groups.flatMap((g) => g.items);

  const go = (item) => {
    pushRecent({ to: item.to, label: item.label });
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(flat.length - 1, a + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
    else if (e.key === "Enter" && flat[active]) (e.preventDefault(), go(flat[active]));
  };

  let idx = -1;
  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center px-6 pt-24">
      <motion.div
        className="absolute inset-0 bg-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={20} aria-hidden="true" className="text-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search claims, customers, registrations or pages…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={flat[active] ? `palette-opt-${active}` : undefined}
            className="h-14 flex-1 bg-transparent text-base text-text outline-none placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div id="palette-list" role="listbox" className="max-h-96 overflow-y-auto p-2">
          {flat.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              No pages match “{q}”. Claim search arrives with claim data in Phase 3.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.name} role="group" aria-label={g.name} className="mb-1">
              <div className="px-3 pt-2 pb-1 text-caption text-subtle">{g.name}</div>
              {g.items.map((item) => {
                idx += 1;
                const i = idx;
                const Icon = item.icon;
                return (
                  <div
                    key={`${g.name}-${item.to}`}
                    id={`palette-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm",
                      i === active ? "bg-bg-muted text-text" : "text-muted",
                    )}
                  >
                    {Icon && <Icon size={16} aria-hidden="true" className="text-subtle" />}
                    <span className="flex-1">{item.label}</span>
                    {i === active && <CornerDownLeft size={16} aria-hidden="true" className="text-subtle" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-caption text-subtle">
          <span className="inline-flex items-center gap-1">
            <Kbd keys={["↑", "↓"]} /> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Enter</Kbd> open
          </span>
        </div>
      </motion.div>
    </div>
  );
}
