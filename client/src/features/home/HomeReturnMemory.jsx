import { useEffect } from "react";
import { useLocation } from "react-router";
import { HOME_RETURN_KEY } from "../../lib/homeReturn";

function read() {
  try { return JSON.parse(sessionStorage.getItem(HOME_RETURN_KEY) || "null"); } catch { return null; }
}
function write(value) {
  try { sessionStorage.setItem(HOME_RETURN_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/**
 * Remembers Home's full URL and scroll position (sessionStorage) so Claim Detail's "← All claims" link comes back to exactly the same
 * list. The position is recorded while scrolling on Home itself — the app shell scrolls to the top as soon as the path changes, before
 * Home unmounts, so it cannot be read at unmount. Restores once the list is tall enough. Renders nothing; Home looks the same.
 */
export function HomeReturnMemory() {
  const location = useLocation();

  useEffect(() => {
    if (window.location.pathname !== "/") return;
    const prev = read() ?? {};
    // keep `restore` (the effect below consumes it); a different list (new filters) starts at the top
    write({ ...prev, search: location.search, y: prev.search === location.search ? prev.y ?? 0 : 0 });
  }, [location.search]);

  useEffect(() => {
    let timer = 0;
    const save = () => {
      timer = 0;
      if (window.location.pathname !== "/") return; // already navigating away; ignore the shell's scroll reset
      write({ search: window.location.search, y: window.scrollY, restore: false });
    };
    const onScroll = () => { if (!timer) timer = setTimeout(save, 100); }; // throttled; timers keep working in background tabs
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearTimeout(timer); window.removeEventListener("scroll", onScroll); };
  }, []);

  useEffect(() => {
    const saved = read();
    if (!saved?.restore) return undefined;
    write({ ...saved, restore: false });
    let tries = 0;
    let id = 0;
    const attempt = () => {
      const reachable = document.documentElement.scrollHeight - window.innerHeight >= saved.y - 4;
      if (reachable || tries++ > 40) {
        window.scrollTo({ top: saved.y, behavior: "auto" });
        return;
      }
      id = setTimeout(attempt, 50);
    };
    attempt();
    return () => clearTimeout(id);
  }, []);
  return null;
}
