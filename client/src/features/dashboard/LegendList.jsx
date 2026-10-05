import { formatNumber } from "../../lib/format";

/** Legend beside a donut/pie: colour dot + label + count + share. Each row drills down; the data never depends on colour alone. */
export function LegendList({ items, total, colors, onSelect }) {
  return (
    <ul className="flex w-full min-w-0 flex-col justify-center gap-1 2xl:flex-1" aria-label="Legend">
      {items.map((i) => (
        <li key={i.key}>
          <button type="button" onClick={() => onSelect(i.link)}
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-caption transition-colors duration-150 hover:bg-bg-muted">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(${colors[i.key] ?? "--chart-6"})` }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-muted">{i.label}</span>
            <span className="num font-semibold text-text">{formatNumber(i.value)}</span>
            <span className="num w-9 text-right text-subtle">{total ? `${Math.round((100 * i.value) / total)}%` : "—"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
