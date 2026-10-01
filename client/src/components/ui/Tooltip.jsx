import { useId, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAnchoredPosition } from "../../hooks/useOverlay";
import { cn } from "../../lib/cn";

/**
 * Tooltip on hover (300 ms intent) and keyboard focus. Wraps its trigger in an inline span so it works
 * with any child, including disabled-looking buttons (which use aria-disabled, not `disabled`).
 */
export function Tooltip({ content, children, placement = "top", delay = 300, className, disabled = false }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const floatRef = useRef(null);
  const timer = useRef();
  const id = useId();
  const pos = useAnchoredPosition(anchorRef, floatRef, open, { placement, offset: 8 });

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!content || disabled) return children;

  const show = (immediate) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), immediate ? 0 : delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <>
      <span
        ref={anchorRef}
        className={cn("inline-flex", className)}
        onPointerEnter={() => show(false)}
        onPointerLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        onKeyDown={(e) => e.key === "Escape" && hide()}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={floatRef}
              id={id}
              role="tooltip"
              className="pointer-events-none fixed top-0 left-0 z-[80] max-w-72 rounded-sm bg-tooltip px-2 py-1 text-caption text-on-tooltip shadow-md"
              style={{ x: pos.x, y: pos.y }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
