import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { usePrefersReducedMotion } from "../../hooks/useReducedMotion";

const played = new Set();

/**
 * Counter animated with anime.js (anime.js owns counters — CLAUDE.md rule 9).
 * Writes textContent directly (no React re-render per frame). Animates from 0 only the first time
 * a given `animateKey` is seen in the session; later value changes tween from the previous value.
 * Reduced motion → jumps straight to the final value.
 */
export function AnimatedNumber({ value, format = (v) => String(Math.round(v)), duration = 1000, animateKey, className }) {
  const ref = useRef(null);
  const prev = useRef(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || value == null) return undefined;
    const firstTime = animateKey ? !played.has(animateKey) : prev.current == null;
    if (animateKey) played.add(animateKey);
    const from = prev.current ?? (firstTime ? 0 : value);
    prev.current = value;
    if (reduced || from === value) {
      el.textContent = format(value);
      return undefined;
    }
    const state = { v: from };
    const anim = animate(state, {
      v: value,
      duration,
      ease: "outExpo",
      onUpdate: () => {
        el.textContent = format(state.v);
      },
      onComplete: () => {
        el.textContent = format(value);
      },
    });
    return () => anim.pause();
    // format is usually an inline function; value/key changes are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced, animateKey, duration]);

  return (
    <span ref={ref} className={className}>
      {value == null ? "—" : format(value)}
    </span>
  );
}
