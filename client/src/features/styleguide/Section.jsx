import { cn } from "../../lib/cn";

/** Style-guide section with an anchor id. */
export function Section({ id, title, description, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <h2 id={`${id}-title`} className="text-xl text-text">
        {title}
      </h2>
      {description && <p className="prose-width mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** A labelled demo area inside a section. */
export function Demo({ label, children, className, bodyClassName }) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface", className)}>
      {label && <div className="border-b border-border px-4 py-2 text-caption text-subtle">{label}</div>}
      <div className={cn("p-6", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Small caption under a demo item. */
export function Caption({ children }) {
  return <span className="text-caption text-subtle">{children}</span>;
}
