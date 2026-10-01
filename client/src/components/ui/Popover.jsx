import { cloneElement, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useAnchoredPosition, useClickOutside, useEscape } from "../../hooks/useOverlay";
import { EASE } from "../../lib/motion";
import { cn } from "../../lib/cn";

/**
 * Popover: anchored floating panel. `trigger` is a single element; it receives onClick, ref,
 * aria-expanded and aria-controls. Closes on Esc / outside click and returns focus to the trigger.
 * Content may be a function `({ close }) => node`.
 */
export function Popover({ trigger, children, placement = "bottom-start", open: controlled, onOpenChange, className, role = "dialog", offset = 8 }) {
  const [local, setLocal] = useState(false);
  const open = controlled ?? local;
  const setOpen = (v) => {
    setLocal(v);
    onOpenChange?.(v);
  };
  const anchorRef = useRef(null);
  const floatRef = useRef(null);
  const refs = useMemo(() => [anchorRef, floatRef], []);
  const id = useId();
  const pos = useAnchoredPosition(anchorRef, floatRef, open, { placement, offset });

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) anchorRef.current?.focus?.({ preventScroll: true });
  };
  useEscape(open, () => close(true));
  useClickOutside(refs, open, () => close(false));

  const triggerEl = cloneElement(trigger, {
    ref: anchorRef,
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    "aria-haspopup": role === "menu" ? "menu" : "dialog",
    onClick: (e) => {
      trigger.props.onClick?.(e);
      setOpen(!open);
    },
  });

  const [side] = pos.placement.split("-");
  return (
    <>
      {triggerEl}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={floatRef}
              id={id}
              role={role === "menu" ? undefined : role}
              className={cn(
                "fixed top-0 left-0 z-[75] min-w-48 rounded-lg border border-border bg-surface-raised shadow-lg outline-none",
                className,
              )}
              style={{ x: pos.x, y: pos.y }}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: EASE }}
              data-side={side}
            >
              {typeof children === "function" ? children({ close }) : children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/**
 * DropdownMenu: Popover with menu semantics and arrow-key navigation.
 * items: [{ label, icon?, onSelect, shortcut?, danger?, checked?, disabled? } | { type: "separator" } | { type: "label", label }]
 */
export function DropdownMenu({ trigger, items, placement = "bottom-end", className }) {
  const listRef = useRef(null);

  const focusItem = (dir) => {
    const nodes = [...(listRef.current?.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])];
    if (!nodes.length) return;
    const idx = nodes.indexOf(document.activeElement);
    let next;
    if (dir === "first") next = 0;
    else if (dir === "last") next = nodes.length - 1;
    else next = (idx + dir + nodes.length) % nodes.length;
    nodes[next].focus();
  };

  return (
    <Popover trigger={trigger} placement={placement} role="menu" className={cn("p-1", className)}>
      {({ close }) => (
        <div
          ref={(el) => {
            listRef.current = el;
            if (el) requestAnimationFrame(() => focusItem("first"));
          }}
          role="menu"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              focusItem(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusItem(-1);
            } else if (e.key === "Home") {
              e.preventDefault();
              focusItem("first");
            } else if (e.key === "End") {
              e.preventDefault();
              focusItem("last");
            } else if (e.key === "Tab") {
              close(false);
            }
          }}
        >
          {items.map((item, i) => {
            if (item.type === "separator") return <div key={`s${i}`} role="separator" className="my-1 h-px bg-border" />;
            if (item.type === "label")
              return (
                <div key={`l${i}`} className="px-3 pt-2 pb-1 text-caption text-subtle">
                  {item.label}
                </div>
              );
            const Icon = item.icon;
            const isCheck = item.checked !== undefined;
            return (
              <button
                key={item.label}
                type="button"
                role={isCheck ? "menuitemcheckbox" : "menuitem"}
                aria-checked={isCheck ? item.checked : undefined}
                aria-disabled={item.disabled || undefined}
                tabIndex={-1}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect?.();
                  if (!item.keepOpen) close(true);
                }}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-sm px-3 text-left text-sm outline-none transition-colors duration-150",
                  "hover:bg-bg-muted focus-visible:bg-bg-muted",
                  item.danger ? "text-danger" : "text-text",
                  item.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {isCheck ? (
                  <span className="inline-flex w-4 justify-center">{item.checked && <Check size={16} aria-hidden="true" />}</span>
                ) : (
                  Icon && <Icon size={16} aria-hidden="true" className={item.danger ? "" : "text-subtle"} />
                )}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && <span className="text-caption text-subtle">{item.shortcut}</span>}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
