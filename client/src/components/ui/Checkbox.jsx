import { forwardRef, useEffect, useId, useRef } from "react";
import { motion } from "motion/react";
import { Check, Minus } from "lucide-react";
import { SPRING } from "../../lib/motion";
import { cn } from "../../lib/cn";

/** Checkbox with label, description and indeterminate support (native input for a11y). */
export const Checkbox = forwardRef(function Checkbox(
  { label, description, checked, indeterminate = false, onChange, disabled, className, ...rest },
  ref,
) {
  const id = useId();
  const inner = useRef(null);
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const on = checked || indeterminate;
  return (
    <label
      htmlFor={id}
      className={cn("inline-flex items-start gap-2", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer", className)}
    >
      <span className="relative mt-0.5 inline-flex h-4 w-4 shrink-0">
        <input
          ref={(el) => {
            inner.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          id={id}
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange?.(e.target.checked, e)}
          disabled={disabled}
          className="peer absolute inset-0 m-0 cursor-[inherit] appearance-none rounded-sm opacity-0"
          {...rest}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex h-4 w-4 items-center justify-center rounded-sm border transition-colors duration-150",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
            on ? "border-primary bg-primary text-on-primary" : "border-border-strong bg-surface",
          )}
        >
          {indeterminate ? <Minus size={12} className="stroke-3" /> : checked && <Check size={12} className="stroke-3" />}
        </span>
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-sm text-text">{label}</span>}
          {description && <span className="text-caption text-subtle">{description}</span>}
        </span>
      )}
    </label>
  );
});

/** Switch (role="switch"). Thumb slides with a spring (transform only). */
export function Switch({ checked, onChange, label, description, disabled, size = "md", className }) {
  const id = useId();
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const thumb = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const travel = size === "sm" ? 16 : 20;
  return (
    <div className={cn("inline-flex items-start gap-3", disabled && "opacity-50", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:cursor-not-allowed",
          track,
          checked ? "bg-primary" : "bg-border-strong",
        )}
      >
        <motion.span
          className={cn("block rounded-full bg-on-blue shadow-sm", thumb)}
          animate={{ x: checked ? travel : 0 }}
          transition={SPRING}
          initial={false}
        />
        <span className="sr-only">{label}</span>
      </button>
      {(label || description) && (
        <label htmlFor={id} className={cn("flex flex-col", !disabled && "cursor-pointer")} aria-hidden="true">
          {label && <span className="text-sm text-text">{label}</span>}
          {description && <span className="text-caption text-subtle">{description}</span>}
        </label>
      )}
    </div>
  );
}
