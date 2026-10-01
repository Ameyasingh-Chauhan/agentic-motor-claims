import { forwardRef, useId } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Field wrapper: label, hint, error (aria-describedby wired). Children get `id`, `aria-invalid`,
 * `aria-describedby` via render prop: <Field label="…">{(p) => <Input {...p} />}</Field>
 */
export function Field({ label, hint, error, required, children, className, labelHidden = false }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label htmlFor={id} className={cn("text-sm font-medium text-text", labelHidden && "sr-only")}>
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, required })}
      {error ? (
        <p id={errId} className="flex items-center gap-1 text-caption text-danger" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-caption text-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const control =
  "w-full rounded-sm border border-border-strong bg-surface text-base text-text placeholder:text-subtle " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-subtle focus:border-focus focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:bg-bg-muted disabled:text-subtle " +
  "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger";

/** Text input with optional leading icon and trailing slot. Height 40px (sm: 32px). */
export const Input = forwardRef(function Input({ icon: Icon, trailing, size = "md", className, inputClassName, ...rest }, ref) {
  return (
    <div className={cn("relative flex items-center", className)}>
      {Icon && (
        <Icon size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-subtle" />
      )}
      <input
        ref={ref}
        className={cn(
          control,
          size === "sm" ? "h-8 px-2 text-sm" : size === "lg" ? "h-12 px-3" : "h-10 px-3",
          Icon && "pl-10",
          trailing && "pr-10",
          inputClassName,
        )}
        {...rest}
      />
      {trailing && <div className="absolute right-1 flex items-center">{trailing}</div>}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, "resize-y px-3 py-2", className)} {...rest} />;
});
