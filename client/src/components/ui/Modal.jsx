import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEscape, useFocusTrap, useScrollLock } from "../../hooks/useOverlay";
import { EASE } from "../../lib/motion";
import { cn } from "../../lib/cn";
import { IconButton } from "./Button";

const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

function OverlayContent({ onClose, initialFocusRef, labelledBy, describedBy, panelClass, motionProps, children }) {
  const ref = useRef(null);
  useFocusTrap(ref, true, initialFocusRef);
  useEscape(true, onClose);
  useScrollLock(true);
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabIndex={-1}
      className={panelClass}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}

/**
 * Modal (§7): focus trap, Esc to close, scroll lock, return focus, 350 ms enter.
 */
export function Modal({ open, onClose, title, description, children, footer, size = "md", initialFocusRef, closeOnBackdrop = true }) {
  const id = useId();
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <motion.div
            className="absolute inset-0 bg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />
          <OverlayContent
            onClose={onClose}
            initialFocusRef={initialFocusRef}
            labelledBy={`${id}-t`}
            describedBy={description ? `${id}-d` : undefined}
            panelClass={cn(
              "relative flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg outline-none",
              widths[size],
            )}
            motionProps={{
              initial: { opacity: 0, y: 12, scale: 0.98 },
              animate: { opacity: 1, y: 0, scale: 1 },
              exit: { opacity: 0, y: 8, scale: 0.98 },
              transition: { duration: 0.35, ease: EASE },
            }}
          >
            <header className="flex items-start gap-4 px-6 pt-6">
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-t`} className="text-xl text-text">
                  {title}
                </h2>
                {description && (
                  <p id={`${id}-d`} className="mt-1 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              <IconButton icon={X} label="Close" onClick={onClose} size="sm" tooltip={false} />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
            {footer && <footer className="flex justify-end gap-3 border-t border-border px-6 py-4">{footer}</footer>}
          </OverlayContent>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Drawer: side panel with the same overlay behaviour. side = "right" | "left". */
export function Drawer({ open, onClose, title, description, children, footer, side = "right", width = "md", initialFocusRef }) {
  const id = useId();
  const w = width === "sm" ? "w-80" : width === "lg" ? "w-160" : "w-120";
  const from = side === "right" ? "100%" : "-100%";
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            className="absolute inset-0 bg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <OverlayContent
            onClose={onClose}
            initialFocusRef={initialFocusRef}
            labelledBy={`${id}-t`}
            describedBy={description ? `${id}-d` : undefined}
            panelClass={cn(
              "absolute top-0 bottom-0 flex max-w-full flex-col border-border bg-surface-raised shadow-lg outline-none",
              side === "right" ? "right-0 border-l" : "left-0 border-r",
              w,
            )}
            motionProps={{
              initial: { x: from },
              animate: { x: 0 },
              exit: { x: from },
              transition: { duration: 0.35, ease: EASE },
            }}
          >
            {title !== undefined && (
              <header className="flex items-start gap-4 border-b border-border px-6 py-4">
                <div className="min-w-0 flex-1">
                  <h2 id={`${id}-t`} className="text-xl text-text">
                    {title}
                  </h2>
                  {description && (
                    <p id={`${id}-d`} className="mt-1 text-sm text-muted">
                      {description}
                    </p>
                  )}
                </div>
                <IconButton icon={X} label="Close" onClick={onClose} size="sm" tooltip={false} />
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer && <footer className="flex justify-end gap-3 border-t border-border px-6 py-4">{footer}</footer>}
          </OverlayContent>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
