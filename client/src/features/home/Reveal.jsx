import { createContext, useContext, useState } from "react";
import { motion } from "motion/react";
import { EASE, firstVisit, staggerDelay } from "../../lib/motion";

const RevealContext = createContext(false);

/**
 * Entrance animation for a view, played once per session (§6.6). Wrap the page in <RevealScope id="home">;
 * each <Reveal index={n}> fades + rises 8px with a 30 ms stagger (first 12 items only; the rest appear instantly).
 * Reduced motion: MotionConfig drops the transform, leaving a short opacity fade.
 */
export function RevealScope({ id, children }) {
  const [play] = useState(() => firstVisit(`reveal:${id}`));
  return <RevealContext.Provider value={play}>{children}</RevealContext.Provider>;
}

export function Reveal({ index = 0, className, children, as = "div" }) {
  const play = useContext(RevealContext);
  const Comp = motion[as];
  if (!play || index >= 12) return <Comp className={className}>{children}</Comp>;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.35, ease: EASE, delay: staggerDelay(index) }}
    >
      {children}
    </Comp>
  );
}
