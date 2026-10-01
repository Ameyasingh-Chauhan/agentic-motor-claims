import { useCallback, useState } from "react";

/** useState backed by localStorage under `key` (no-op persistence when key is falsy). */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    if (!key) return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (key) {
          try {
            localStorage.setItem(key, JSON.stringify(resolved));
          } catch {
            /* ignore */
          }
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}
