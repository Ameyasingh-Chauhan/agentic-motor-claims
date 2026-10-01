import { cn } from "../../lib/cn";

/** Keyboard key hint. Pass `keys={["Ctrl", "K"]}` or children. */
export function Kbd({ keys, children, className }) {
  const list = keys ?? [children];
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {list.map((k) => (
        <kbd
          key={k}
          className="mono inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border-strong bg-bg-muted px-1 text-caption text-muted"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
