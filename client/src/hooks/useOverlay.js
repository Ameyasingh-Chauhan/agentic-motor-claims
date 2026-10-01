import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let scrollLocks = 0;

/** Lock body scroll while `active` (reference-counted for stacked overlays). */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    scrollLocks += 1;
    const html = document.documentElement;
    const gap = window.innerWidth - html.clientWidth;
    if (scrollLocks === 1) {
      html.style.overflow = "hidden";
      if (gap > 0) html.style.paddingRight = `${gap}px`;
    }
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) {
        html.style.overflow = "";
        html.style.paddingRight = "";
      }
    };
  }, [active]);
}

/**
 * Trap Tab focus inside `containerRef` while active, focus the first element (or `initialFocusRef`)
 * on open, and return focus to the previously focused element on close.
 */
export function useFocusTrap(containerRef, active, initialFocusRef) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    const node = containerRef.current;
    const raf = requestAnimationFrame(() => {
      const target = initialFocusRef?.current || node?.querySelector(FOCUSABLE) || node;
      target?.focus({ preventScroll: true });
    });
    const onKey = (e) => {
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      if (previous && typeof previous.focus === "function") previous.focus({ preventScroll: true });
    };
  }, [active, containerRef, initialFocusRef]);
}

/** Call `onEscape` when Esc is pressed while active. */
export function useEscape(active, onEscape) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        ref.current?.(e);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}

/** Close when a pointer goes down outside all given refs. */
export function useClickOutside(refs, active, onOutside) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!active) return undefined;
    const onDown = (e) => {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return;
      cb.current?.(e);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active, refs]);
}

/**
 * Position a floating element next to an anchor (fixed positioning), flipping when it would
 * overflow the viewport. Returns {x, y, placement} and a `update` function.
 */
export function useAnchoredPosition(anchorRef, floatingRef, open, { placement = "bottom-start", offset = 8 } = {}) {
  const [pos, setPos] = useState({ x: -9999, y: -9999, placement });

  const update = useCallback(() => {
    const a = anchorRef.current;
    const f = floatingRef.current;
    if (!a || !f) return;
    const ar = a.getBoundingClientRect();
    const fw = f.offsetWidth;
    const fh = f.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let [side, align = "center"] = placement.split("-");

    if (side === "bottom" && ar.bottom + offset + fh > vh && ar.top - offset - fh > 0) side = "top";
    else if (side === "top" && ar.top - offset - fh < 0) side = "bottom";
    if (side === "right" && ar.right + offset + fw > vw) side = "left";
    else if (side === "left" && ar.left - offset - fw < 0) side = "right";

    let x;
    let y;
    if (side === "bottom" || side === "top") {
      y = side === "bottom" ? ar.bottom + offset : ar.top - offset - fh;
      if (align === "start") x = ar.left;
      else if (align === "end") x = ar.right - fw;
      else x = ar.left + ar.width / 2 - fw / 2;
    } else {
      x = side === "right" ? ar.right + offset : ar.left - offset - fw;
      if (align === "start") y = ar.top;
      else if (align === "end") y = ar.bottom - fh;
      else y = ar.top + ar.height / 2 - fh / 2;
    }
    x = Math.max(8, Math.min(x, vw - fw - 8));
    y = Math.max(8, Math.min(y, vh - fh - 8));
    setPos({ x, y, placement: `${side}-${align}` });
  }, [anchorRef, floatingRef, placement, offset]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  return { ...pos, update };
}
