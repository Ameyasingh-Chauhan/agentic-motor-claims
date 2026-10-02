import { forwardRef, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { useAnchoredPosition, useClickOutside } from "../../hooks/useOverlay";
import { EASE } from "../../lib/motion";
import { cn } from "../../lib/cn";

/**
 * Select (listbox pattern). options: [{ value, label, description?, icon?, disabled? }]
 * Keyboard: Enter/Space/↓ opens, ↑/↓ move, Home/End, type-ahead, Enter selects, Esc closes.
 */
export const Select = forwardRef(function Select(
  { options, value, onChange, placeholder = "Select…", disabled, size = "md", className, id: idProp, ...aria },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const autoId = useId();
  const id = idProp ?? autoId;
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const typeahead = useRef({ q: "", t: 0 });
  const refs = useMemo(() => [btnRef, listRef], []);
  const pos = useAnchoredPosition(btnRef, listRef, open, { placement: "bottom-start", offset: 4 });
  const selected = options.find((o) => o.value === value);

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (i) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange?.(o.value);
    setOpen(false);
    btnRef.current?.focus();
  };
  useClickOutside(refs, open, () => setOpen(false));

  const move = (dir) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") (e.preventDefault(), move(1));
    else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
    else if (e.key === "Home") (e.preventDefault(), setActive(0));
    else if (e.key === "End") (e.preventDefault(), setActive(options.length - 1));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), choose(active));
    else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setOpen(false));
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const now = Date.now();
      typeahead.current.q = now - typeahead.current.t > 600 ? e.key : typeahead.current.q + e.key;
      typeahead.current.t = now;
      const q = typeahead.current.q.toLowerCase();
      const i = options.findIndex((o) => String(o.label).toLowerCase().startsWith(q));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button
        ref={(el) => {
          btnRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center gap-2 rounded-sm border border-border-strong bg-surface text-left text-text transition-colors duration-150",
          "hover:border-subtle disabled:cursor-not-allowed disabled:bg-bg-muted disabled:text-subtle aria-invalid:border-danger",
          size === "sm" ? "h-8 px-2 text-sm" : "h-10 px-3 text-base",
          className,
        )}
        {...aria}
      >
        {selected?.icon && <selected.icon size={16} aria-hidden="true" className="text-subtle" />}
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-subtle")}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" className={cn("text-subtle transition-transform duration-200", open && "rotate-180")} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={listRef}
              id={`${id}-list`}
              role="listbox"
              data-popover-layer=""
              aria-labelledby={id}
              className="fixed top-0 left-0 z-[75] max-h-72 overflow-y-auto rounded-md border border-border bg-surface-raised p-1 shadow-lg"
              style={{ x: pos.x, y: pos.y, minWidth: btnRef.current?.offsetWidth }}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE }}
            >
              {options.map((o, i) => {
                const isSel = o.value === value;
                const Icon = o.icon;
                return (
                  <li
                    key={String(o.value)}
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm",
                      i === active && "bg-bg-muted",
                      isSel ? "font-medium text-text" : "text-muted",
                      o.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {Icon && <Icon size={16} aria-hidden="true" className="text-subtle" />}
                    <span className="flex-1">
                      {o.label}
                      {o.description && <span className="block text-caption text-subtle">{o.description}</span>}
                    </span>
                    {isSel && <Check size={16} aria-hidden="true" className="text-orange-700" />}
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
});
