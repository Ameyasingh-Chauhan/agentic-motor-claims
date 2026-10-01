import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { useSearchParams } from "react-router";
import { SPRING } from "../../lib/motion";
import { cn } from "../../lib/cn";
import { CountBadge } from "./Badge";

/**
 * Tabs (§7): sliding underline indicator (layoutId), arrow-key navigation (roving tabindex),
 * optional URL sync (`urlParam="tab"` → ?tab=damage), overflow scroll with fade edges, badge counts.
 * tabs: [{ value, label, icon?, count?, countTone? }]
 */
export function Tabs({ tabs, value: controlled, onChange, defaultValue, urlParam, className, children }) {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState(defaultValue ?? tabs[0]?.value);
  const fromUrl = urlParam ? params.get(urlParam) : null;
  const value = controlled ?? (urlParam && tabs.some((t) => t.value === fromUrl) ? fromUrl : local);
  const id = useId();
  const listRef = useRef(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const select = (v) => {
    if (urlParam) {
      const next = new URLSearchParams(params);
      next.set(urlParam, v);
      setParams(next, { replace: true });
    }
    setLocal(v);
    onChange?.(v);
  };

  const updateFade = () => {
    const el = listRef.current;
    if (!el) return;
    setFade({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    updateFade();
    const el = listRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  const onKeyDown = (e) => {
    const idx = tabs.findIndex((t) => t.value === value);
    let next = null;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next == null) return;
    e.preventDefault();
    select(tabs[next].value);
    listRef.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  };

  return (
    <div className={className}>
      <div className="relative border-b border-border">
        <div
          ref={listRef}
          role="tablist"
          onKeyDown={onKeyDown}
          onScroll={updateFade}
          className="no-scrollbar flex gap-1 overflow-x-auto"
          style={{
            // Alpha mask (not a colour): fades the edges when the tab list overflows.
            maskImage: `linear-gradient(90deg, ${fade.left ? "transparent" : "black"} 0, black 2rem, black calc(100% - 2rem), ${fade.right ? "transparent" : "black"} 100%)`,
          }}
        >
          {tabs.map((t) => {
            const active = t.value === value;
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                role="tab"
                type="button"
                id={`${id}-tab-${t.value}`}
                aria-selected={active}
                aria-controls={`${id}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => select(t.value)}
                className={cn(
                  "relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                  active ? "text-text" : "text-subtle hover:text-text",
                )}
              >
                {Icon && <Icon size={16} aria-hidden="true" />}
                {t.label}
                {t.count != null && t.count > 0 && <CountBadge count={t.count} tone={t.countTone ?? "neutral"} />}
                {active && (
                  <motion.span
                    layoutId={`tab-indicator-${id}`}
                    transition={SPRING}
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      {children && (
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`} tabIndex={0} className="pt-4">
          {typeof children === "function" ? children(value) : children}
        </div>
      )}
    </div>
  );
}
