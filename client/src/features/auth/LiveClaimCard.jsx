import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Circle, TriangleAlert } from "lucide-react";
import { EASE } from "../../lib/motion";
import { cn } from "../../lib/cn";

const AGENTS = ["Intake", "Document", "Verification", "Damage", "Fraud", "Adjudication", "Communication"];
const STEP_MS = 650;
const HOLD_MS = 3200;

const CLAIMS = [
  {
    id: "ABC-MC-2026-000241", vehicle: "Hyundai Creta · MH 12 AB 1234", incident: "Rear-end collision · Pune",
    outcome: { level: "pass", text: "Pre-auth issued · ₹29,580 · decided in 38 s" },
  },
  {
    id: "ABC-MC-2026-000239", vehicle: "Maruti Baleno · KL 07 CD 5512", incident: "Basement parking scrape · Kochi",
    outcome: { level: "warn", text: "Sent for review · garage quote 34% above estimate" },
  },
];

/**
 * Illustrative claim travelling through the seven agents on the login brand panel. A single sequenced timer:
 * each agent goes idle → working (blue pulse) → done (green check); the outcome appears only after all seven.
 * The timer skips ticks while the tab is hidden.
 */
export function LiveClaimCard() {
  const [claimIdx, setClaimIdx] = useState(0);
  const [step, setStep] = useState(0); // agents < step are done; agent === step is working; step === 7 → outcome
  const [nudge, setNudge] = useState(0); // re-arms the timer without advancing while the tab is hidden

  useEffect(() => {
    const done = step >= AGENTS.length;
    const id = window.setTimeout(() => {
      if (document.hidden) return setNudge((n) => n + 1);
      if (done) {
        setClaimIdx((i) => (i + 1) % CLAIMS.length);
        setStep(0);
      } else {
        setStep((s) => s + 1);
      }
    }, done ? HOLD_MS : STEP_MS);
    return () => window.clearTimeout(id);
  }, [step, claimIdx, nudge]);

  const claim = CLAIMS[claimIdx];
  const finished = step >= AGENTS.length;

  return (
    <div className="rounded-lg bg-surface p-5 text-text shadow-lg" role="img" aria-label={`Example claim processed by seven AI agents: ${claim.outcome.text}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={claim.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="mono text-caption text-muted">{claim.id}</span>
            <span className="inline-flex items-center gap-1 text-caption text-blue-600">
              <span className="pulse-dot h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
              Live
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold">{claim.vehicle}</p>
          <p className="text-caption text-muted">{claim.incident}</p>
        </motion.div>
      </AnimatePresence>

      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        {AGENTS.map((agent, i) => {
          const state = i < step ? "done" : i === step ? "working" : "idle";
          return (
            <li key={agent} className="flex items-center gap-2 text-caption">
              <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden="true">
                <AnimatePresence mode="popLayout" initial={false}>
                  {state === "done" ? (
                    <motion.span key="done" className="flex text-success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2, ease: EASE }}>
                      <CircleCheck size={16} />
                    </motion.span>
                  ) : state === "working" ? (
                    <motion.span key="working" className="h-2.5 w-2.5 rounded-full bg-blue-600" initial={{ opacity: 0.35 }}
                      animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }} />
                  ) : (
                    <motion.span key="idle" className="flex text-subtle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <Circle size={14} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className={cn(state === "idle" ? "text-subtle" : "text-text", state === "working" && "font-semibold")}>{agent}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 h-9">
        <AnimatePresence initial={false}>
          {finished && (
            <motion.div
              key={claim.id}
              initial={{ opacity: 0, transform: "translateY(4px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className={cn(
                "flex h-9 items-center gap-2 rounded-md px-3 text-caption font-semibold",
                claim.outcome.level === "pass" ? "bg-success-bg text-success" : "bg-warning-bg text-warning",
              )}
            >
              {claim.outcome.level === "pass" ? <CircleCheck size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
              {claim.outcome.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
