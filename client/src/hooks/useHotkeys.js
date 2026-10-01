import { useEffect, useRef } from "react";

const isTypingTarget = (el) =>
  el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * Register a keyboard shortcut. `combo` like "ctrl+b", "ctrl+k", "?", "escape".
 * `ctrl` also matches ⌘ on macOS. Plain-key shortcuts are ignored while typing.
 */
export function useHotkey(combo, handler, { enabled = true, allowInInputs = false } = {}) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const parts = combo.toLowerCase().split("+");
    const key = parts.pop();
    const needCtrl = parts.includes("ctrl");
    const needShift = parts.includes("shift");
    const needAlt = parts.includes("alt");

    const onKey = (e) => {
      if (e.key?.toLowerCase() !== key) return;
      if (needCtrl !== (e.ctrlKey || e.metaKey)) return;
      if (needAlt !== e.altKey) return;
      if (needShift && !e.shiftKey) return;
      if (!needCtrl && !allowInInputs && isTypingTarget(e.target)) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, enabled, allowInInputs]);
}
