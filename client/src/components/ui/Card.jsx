import { cn } from "../../lib/cn";
import { Collapsible } from "./Collapsible";

/**
 * Card (§7): header (title, subtitle, actions slot), body, optional footer.
 * `collapsible` turns the header into a Collapsible trigger (with optional `persistKey`).
 * `compact` uses 16px padding instead of 24px.
 */
export function Card({
  title,
  subtitle,
  actions,
  footer,
  children,
  compact = false,
  collapsible = false,
  defaultOpen = true,
  persistKey,
  className,
  bodyClassName,
  as: Tag = "section",
  ...rest
}) {
  const pad = compact ? "p-4" : "p-6";
  const hasHeader = title || actions;

  if (collapsible) {
    return (
      <Tag className={cn("rounded-lg border border-border bg-surface shadow-sm", className)} {...rest}>
        <Collapsible
          title={<span className="text-lg font-semibold">{title}</span>}
          subtitle={subtitle}
          actions={actions}
          defaultOpen={defaultOpen}
          persistKey={persistKey}
          headerClassName={cn(compact ? "px-4 pt-2" : "px-6 pt-3", "pb-1")}
          contentClassName={cn(compact ? "px-4 pb-4" : "px-6 pb-6", bodyClassName)}
        >
          {children}
        </Collapsible>
        {footer && <div className={cn("border-t border-border", compact ? "px-4 py-3" : "px-6 py-4")}>{footer}</div>}
      </Tag>
    );
  }

  return (
    <Tag className={cn("rounded-lg border border-border bg-surface shadow-sm", className)} {...rest}>
      {hasHeader && (
        <header className={cn("flex items-start gap-4", compact ? "px-4 pt-4" : "px-6 pt-6")}>
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-lg text-text">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(pad, hasHeader && (compact ? "pt-3" : "pt-4"), bodyClassName)}>{children}</div>
      {footer && <div className={cn("border-t border-border", compact ? "px-4 py-3" : "px-6 py-4")}>{footer}</div>}
    </Tag>
  );
}
