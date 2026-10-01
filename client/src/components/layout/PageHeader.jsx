import { cn } from "../../lib/cn";

/** Page title row: title (24px), optional description, actions on the right. */
export function PageHeader({ title, description, actions, eyebrow, className }) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end gap-4", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-1 text-caption text-subtle">{eyebrow}</p>}
        <h1 className="text-2xl text-text">{title}</h1>
        {description && <p className="prose-width mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
