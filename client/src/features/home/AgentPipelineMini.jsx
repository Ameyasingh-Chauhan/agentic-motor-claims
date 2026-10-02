import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { createMotionPath, createTimeline, svg, animate } from "animejs";
import { Check } from "lucide-react";
import { Tooltip } from "../../components/ui/Tooltip";
import { usePrefersReducedMotion } from "../../hooks/useReducedMotion";
import { firstVisit } from "../../lib/motion";
import { cn } from "../../lib/cn";
import { AGENTS } from "./constants";

// 520×170 user space. Top row left→right (4 agents), U-turn, bottom row right→left (3 agents).
const VB = { w: 520, h: 170 };
const POS = [[12, 25], [37.33, 25], [62.67, 25], [88, 25], [80, 75], [50, 75], [20, 75]];
const PATH = "M 62.4 42.5 H 457.6 C 520 42.5, 520 127.5, 457.6 127.5 H 104";
const LOOP_MS = 5200;
const HOLD_MS = 1400;

/**
 * Hero mini pipeline: lines draw in once per session (anime.js `createDrawable`), then an orange "claim" pulse
 * travels the path on a loop (anime.js motion path → transforms only) and each agent ticks blue → green as it
 * passes. Pauses while the tab is hidden; static (all done, no pulse) with reduced motion.
 */
export function AgentPipelineMini({ customer = false }) {
  const agents = customer ? AGENTS.map((a) => ({ ...a, label: a.customerLabel ?? a.label })) : AGENTS;
  const reduced = usePrefersReducedMotion();
  const pathRef = useRef(null);
  const pulseRef = useRef(null);
  const [states, setStates] = useState(() => AGENTS.map(() => (reduced ? "done" : "idle")));

  useEffect(() => {
    if (reduced || !pathRef.current || !pulseRef.current) {
      setStates(AGENTS.map(() => "done"));
      return undefined;
    }
    const path = pathRef.current;
    const total = path.getTotalLength();
    // Length along the path at which the pulse reaches each node (straight rows are exact; bottom row from the end).
    const topStep = ((POS[1][0] - POS[0][0]) / 100) * VB.w;
    const bottomStep = ((POS[4][0] - POS[5][0]) / 100) * VB.w;
    const at = [0, topStep, topStep * 2, topStep * 3, total - bottomStep * 2, total - bottomStep, total].map((l) => l / total);

    const draw = firstVisit("home-hero-pipeline")
      ? animate(svg.createDrawable(path), { draw: ["0 0", "0 1"], duration: 900, ease: "inOutQuad" })
      : null;

    const set = (i, s) => setStates((prev) => prev.map((v, j) => (j === i ? s : v)));
    const tl = createTimeline({
      loop: true,
      autoplay: false,
      onLoop: () => setStates(AGENTS.map(() => "idle")),
    });
    tl.add(pulseRef.current, { ...createMotionPath(path), opacity: [{ to: 1, duration: 150 }], duration: LOOP_MS, ease: "linear" }, 0);
    at.forEach((f, i) => {
      tl.call(() => set(i, "working"), f * LOOP_MS);
      tl.call(() => set(i, "done"), Math.min(f * LOOP_MS + 420, LOOP_MS));
    });
    tl.add(pulseRef.current, { opacity: 0, duration: 200 }, LOOP_MS);
    tl.call(() => {}, LOOP_MS + HOLD_MS);

    const start = setTimeout(() => !document.hidden && tl.play(), draw ? 900 : 0);
    const onVisibility = () => (document.hidden ? tl.pause() : tl.play());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(start);
      document.removeEventListener("visibilitychange", onVisibility);
      tl.revert();
      draw?.revert();
    };
  }, [reduced]);

  return (
    <div className="agent-pipeline" role="img" aria-label={`Seven AI agents process each claim in sequence: ${agents.map((a) => a.label).join(", ")}`}>
      <svg viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path ref={pathRef} d={PATH} fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" />
        <circle ref={pulseRef} r="6" cx="0" cy="0" fill="var(--orange-500)" opacity="0" />
      </svg>
      {agents.map((agent, i) => {
        const state = states[i];
        return (
          <div key={agent.key} className="agent-node" style={{ left: `${POS[i][0]}%`, top: `${POS[i][1]}%` }}>
            <Tooltip content={`${agent.label} agent`}>
              <motion.span
                key={state}
                initial={reduced ? false : { scale: 0.88 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-surface",
                  state === "idle" && "border-border text-subtle",
                  state === "working" && "border-blue-600 bg-tint-blue-bg text-tint-blue",
                  state === "done" && "border-success bg-success-bg text-success",
                )}
              >
                <agent.icon size={16} aria-hidden="true" />
                {state === "done" && (
                  <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-on-status">
                    <Check size={10} strokeWidth={3} aria-hidden="true" />
                  </span>
                )}
              </motion.span>
            </Tooltip>
            <span className="agent-node-label text-caption text-muted">{agent.label}</span>
          </div>
        );
      })}
    </div>
  );
}
