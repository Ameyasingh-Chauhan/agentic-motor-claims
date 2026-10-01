// Shared motion constants (§6.6). Motion durations are in seconds.
export const EASE = [0.2, 0.8, 0.2, 1];
export const SPRING = { type: "spring", stiffness: 400, damping: 32 };
export const DUR = { press: 0.15, toggle: 0.2, collapse: 0.25, page: 0.35 };

/** Page transition: fade + 8px rise, no horizontal sliding. */
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: DUR.page, ease: EASE },
};

/** Lists: 30 ms stagger, at most 12 items animated; the rest appear instantly. */
export function staggerDelay(index) {
  return index < 12 ? index * 0.03 : 0;
}

/** Entrance animations run once per session per view. Returns true the first time a key is seen. */
const seen = new Set();
export function firstVisit(key) {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/** Fired at the end of the sidebar animation so charts can resize (§6.4). */
export const LAYOUT_RESIZE_EVENT = "layout:resize";
