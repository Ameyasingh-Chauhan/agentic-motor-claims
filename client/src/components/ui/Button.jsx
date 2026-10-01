import { forwardRef } from "react";
import { Link } from "react-router";
import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard " +
  "active:scale-[0.98] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:scale-100";

const variants = {
  primary: "bg-primary text-on-primary shadow-sm hover:bg-primary-hover aria-disabled:hover:bg-primary",
  secondary:
    "border border-border-strong bg-surface text-text shadow-sm hover:bg-bg-muted aria-disabled:hover:bg-surface",
  ghost: "text-muted hover:bg-bg-muted hover:text-text aria-disabled:hover:bg-transparent",
  danger: "bg-danger text-on-status shadow-sm hover:bg-danger-hover aria-disabled:hover:bg-danger",
  link: "h-auto! px-0! text-blue-600 underline-offset-4 hover:underline active:scale-100",
};

const sizes = {
  sm: "h-8 rounded-md px-3 text-sm",
  md: "h-10 rounded-md px-4 text-sm",
  lg: "h-12 rounded-md px-5 text-base",
};

const iconSize = { sm: 16, md: 16, lg: 20 };

/**
 * Button (§7). Variants: primary | secondary | ghost | danger | link. Sizes: sm 32 / md 40 / lg 48.
 * `loading` keeps the width (spinner replaces the icon, or overlays the label when there is no icon).
 * `to` renders a router Link styled as a button.
 * `disabledReason` disables the button and explains why in a tooltip (uses aria-disabled so it stays focusable).
 */
export const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    disabled = false,
    disabledReason,
    fullWidth = false,
    className,
    children,
    onClick,
    type = "button",
    to,
    ...rest
  },
  ref,
) {
  const s = iconSize[size];
  if (to) {
    // Navigation styled as a button: a real link (never a <button> nested inside an <a>).
    return (
      <Link ref={ref} to={to} className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)} {...rest}>
        {Icon && <Icon size={s} aria-hidden="true" />}
        {children}
        {IconRight && <IconRight size={s} aria-hidden="true" />}
      </Link>
    );
  }
  const isDisabled = disabled || Boolean(disabledReason) || loading;
  const overlaySpinner = loading && !Icon;

  const button = (
    <button
      ref={ref}
      type={type}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (isDisabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {Icon && (loading ? <Spinner size={s} /> : <Icon size={s} aria-hidden="true" />)}
      <span className={cn("inline-flex items-center gap-2", overlaySpinner && "invisible")}>{children}</span>
      {IconRight && <IconRight size={s} aria-hidden="true" />}
      {overlaySpinner && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={s} />
        </span>
      )}
    </button>
  );

  if (disabledReason) {
    return (
      <Tooltip content={disabledReason} className={fullWidth ? "w-full" : undefined}>
        {button}
      </Tooltip>
    );
  }
  return button;
});

const iconSizes = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" };

/** Square icon-only button. `label` is required: it becomes the aria-label and the tooltip. */
export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, size = "md", variant = "ghost", className, tooltip = true, iconSize: is, ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-[background-color,color,transform] duration-150 ease-standard active:scale-95",
        variant === "ghost" && "text-muted hover:bg-bg-muted hover:text-text",
        variant === "secondary" && "border border-border-strong bg-surface text-text shadow-sm hover:bg-bg-muted",
        variant === "solid" && "bg-primary text-on-primary hover:bg-primary-hover",
        iconSizes[size],
        className,
      )}
      {...rest}
    >
      <Icon size={is ?? (size === "lg" ? 24 : 20)} aria-hidden="true" />
    </button>
  );
  return tooltip ? <Tooltip content={label}>{btn}</Tooltip> : btn;
});
