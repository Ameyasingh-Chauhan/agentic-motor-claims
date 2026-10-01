import { Check, X } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Stepper: steps = [{ key, label, description? }], `current` index, optional `errorAt` index.
 * Completed steps are clickable when `onStepClick` is given.
 */
export function Stepper({ steps, current = 0, errorAt, onStepClick, className }) {
  return (
    <ol className={cn("flex w-full items-start", className)} aria-label="Progress">
      {steps.map((s, i) => {
        const state = i === errorAt ? "error" : i < current ? "done" : i === current ? "current" : "upcoming";
        const clickable = onStepClick && state === "done";
        const Tag = clickable ? "button" : "div";
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center last:flex-none" aria-current={state === "current" ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="absolute top-4 left-1/2 h-0.5 w-full bg-border">
                <span
                  className="block h-full origin-left bg-primary transition-transform duration-300 ease-standard"
                  style={{ transform: `scaleX(${i < current ? 1 : 0})` }}
                />
              </span>
            )}
            <Tag
              type={clickable ? "button" : undefined}
              onClick={clickable ? () => onStepClick(i) : undefined}
              className={cn("relative z-10 flex flex-col items-center gap-2 px-2", clickable && "rounded-md")}
            >
              <span
                className={cn(
                  "num flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors duration-200",
                  state === "done" && "border-primary bg-primary text-on-primary",
                  state === "current" && "border-primary bg-surface text-orange-700",
                  state === "upcoming" && "border-border-strong bg-surface text-subtle",
                  state === "error" && "border-danger bg-danger text-on-status",
                )}
              >
                {state === "done" ? <Check size={16} aria-hidden="true" /> : state === "error" ? <X size={16} aria-hidden="true" /> : i + 1}
              </span>
              <span className="flex flex-col items-center text-center">
                <span className={cn("text-sm font-medium", state === "upcoming" ? "text-subtle" : "text-text")}>{s.label}</span>
                {s.description && <span className="text-caption text-subtle">{s.description}</span>}
                <span className="sr-only">
                  {state === "done" ? "(completed)" : state === "current" ? "(current step)" : state === "error" ? "(has errors)" : ""}
                </span>
              </span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}
