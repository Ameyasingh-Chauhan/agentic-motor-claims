import { createContext, useContext, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { usePersistentState } from "../../hooks/usePersistentState";
import { EASE } from "../../lib/motion";
import { cn } from "../../lib/cn";

/**
 * Single shared expand/collapse implementation (§7).
 * Animated height ("auto"), chevron rotates 180°, aria-expanded/controls, optional `persistKey`
 * (localStorage), content unmounts only after the close animation. Controlled via `open`/`onOpenChange`.
 */
export function Collapsible({
  title,
  subtitle,
  actions,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  persistKey,
  children,
  className,
  headerClassName,
  contentClassName,
  disabled = false,
}) {
  const [stored, setStored] = usePersistentState(persistKey ? `amc-collapse:${persistKey}` : null, defaultOpen);
  const [local, setLocal] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : persistKey ? stored : local;
  const id = useId();
  const headerId = `${id}-h`;
  const panelId = `${id}-p`;

  const setOpen = (next) => {
    if (!isControlled) (persistKey ? setStored : setLocal)(next);
    onOpenChange?.(next);
  };

  return (
    <div className={className}>
      <div className={cn("flex items-center gap-3", headerClassName)}>
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className="flex min-h-10 flex-1 items-center gap-3 rounded-md py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">{title}</span>
            {subtitle && <span className="block text-caption font-normal text-subtle">{subtitle}</span>}
          </span>
          <motion.span
            className="inline-flex text-subtle"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            aria-hidden="true"
          >
            <ChevronDown size={20} />
          </motion.span>
        </button>
        {actions}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={headerId}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div className={cn("pt-2 pb-1", contentClassName)}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const AccordionCtx = createContext(null);

/**
 * Accordion = a group of Collapsibles. `type="single"` keeps one item open; "multiple" allows many.
 */
export function Accordion({ type = "single", defaultValue, persistKey, children, className }) {
  const initial = defaultValue ?? (type === "single" ? null : []);
  const [stored, setStored] = usePersistentState(persistKey ? `amc-accordion:${persistKey}` : null, initial);
  const toggle = (value) => {
    setStored((prev) => {
      if (type === "single") return prev === value ? null : value;
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    });
  };
  const isOpen = (value) => (type === "single" ? stored === value : Array.isArray(stored) && stored.includes(value));
  return (
    <AccordionCtx.Provider value={{ toggle, isOpen }}>
      <div className={cn("divide-y divide-border rounded-lg border border-border bg-surface", className)}>
        {children}
      </div>
    </AccordionCtx.Provider>
  );
}

export function AccordionItem({ value, title, subtitle, children }) {
  const ctx = useContext(AccordionCtx);
  return (
    <Collapsible
      title={title}
      subtitle={subtitle}
      open={ctx.isOpen(value)}
      onOpenChange={() => ctx.toggle(value)}
      headerClassName="px-4"
      contentClassName="px-4 pb-4 text-sm text-muted"
    >
      {children}
    </Collapsible>
  );
}
