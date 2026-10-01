import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "./Popover";
import { Button, IconButton } from "./Button";
import { formatDate } from "../../lib/format";
import { cn } from "../../lib/cn";

const PRESETS = [
  { key: "7d", label: "Last 7 days", range: () => [dayjs().subtract(6, "day"), dayjs()] },
  { key: "30d", label: "Last 30 days", range: () => [dayjs().subtract(29, "day"), dayjs()] },
  { key: "90d", label: "Last 90 days", range: () => [dayjs().subtract(89, "day"), dayjs()] },
  { key: "mtd", label: "This month", range: () => [dayjs().startOf("month"), dayjs()] },
  { key: "ytd", label: "This year", range: () => [dayjs().startOf("year"), dayjs()] },
];

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function MonthGrid({ month, from, to, hover, onPick, onHover }) {
  const start = month.startOf("month");
  const offset = (start.day() + 6) % 7; // Monday-first
  const days = month.daysInMonth();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(start.date(d));
  const end = to ?? hover;
  const today = dayjs();

  return (
    <div className="w-64">
      <div className="mb-2 text-center text-sm font-semibold text-text">{month.format("MMMM YYYY")}</div>
      <div className="grid grid-cols-7 gap-y-1" role="grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="flex h-8 items-center justify-center text-caption text-subtle" role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const isFrom = from && d.isSame(from, "day");
          const isTo = end && d.isSame(end, "day");
          const lo = from && end && (from.isBefore(end) ? from : end);
          const hi = from && end && (from.isBefore(end) ? end : from);
          const inRange = lo && hi && d.isAfter(lo, "day") && d.isBefore(hi, "day");
          const future = d.isAfter(today, "day");
          return (
            <button
              key={d.format("YYYY-MM-DD")}
              type="button"
              disabled={future}
              onClick={() => onPick(d)}
              onPointerEnter={() => onHover(d)}
              aria-label={d.format("DD MMM YYYY")}
              aria-pressed={Boolean(isFrom || isTo)}
              className={cn(
                "num flex h-8 items-center justify-center text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:text-border-strong",
                inRange && "bg-bg-muted text-text",
                isFrom || isTo ? "rounded-sm bg-primary font-semibold text-on-primary" : "rounded-sm hover:bg-bg-muted",
                d.isSame(today, "day") && !(isFrom || isTo) && "font-semibold text-blue-700",
              )}
            >
              {d.date()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * DateRangePicker: presets + two-month calendar. value = { from: "YYYY-MM-DD", to: "YYYY-MM-DD", preset? }.
 * Future dates are disabled.
 */
export function DateRangePicker({ value, onChange, className, label = "Date range" }) {
  const [draft, setDraft] = useState({ from: null, to: null });
  const [hover, setHover] = useState(null);
  const [cursor, setCursor] = useState(() => dayjs(value?.to ?? undefined).startOf("month").subtract(1, "month"));

  const display = useMemo(() => {
    if (!value?.from) return "All time";
    const preset = PRESETS.find((p) => p.key === value.preset);
    if (preset) return preset.label;
    return `${formatDate(value.from)} – ${formatDate(value.to)}`;
  }, [value]);

  const pick = (d) => {
    if (!draft.from || draft.to) setDraft({ from: d, to: null });
    else {
      const [a, b] = d.isBefore(draft.from) ? [d, draft.from] : [draft.from, d];
      setDraft({ from: a, to: b });
    }
  };

  return (
    <Popover
      placement="bottom-start"
      onOpenChange={(o) => {
        if (o) {
          setDraft({ from: value?.from ? dayjs(value.from) : null, to: value?.to ? dayjs(value.to) : null });
          setCursor(dayjs(value?.to ?? undefined).startOf("month").subtract(1, "month"));
        }
      }}
      trigger={
        <button
          type="button"
          aria-label={`${label}: ${display}`}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-surface px-3 text-sm text-text transition-colors duration-150 hover:border-subtle",
            className,
          )}
        >
          <CalendarDays size={16} aria-hidden="true" className="text-subtle" />
          {display}
        </button>
      }
    >
      {({ close }) => (
        <div className="flex">
          <div className="flex w-40 flex-col gap-1 border-r border-border p-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  const [f, t] = p.range();
                  onChange?.({ from: f.format("YYYY-MM-DD"), to: t.format("YYYY-MM-DD"), preset: p.key });
                  close();
                }}
                className={cn(
                  "h-8 rounded-sm px-2 text-left text-sm transition-colors duration-150 hover:bg-bg-muted",
                  value?.preset === p.key ? "bg-bg-muted font-medium text-orange-700" : "text-muted",
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onChange?.({ from: null, to: null, preset: null });
                close();
              }}
              className="h-8 rounded-sm px-2 text-left text-sm text-muted transition-colors duration-150 hover:bg-bg-muted"
            >
              All time
            </button>
          </div>
          <div className="p-4">
            <div className="relative flex gap-6" onPointerLeave={() => setHover(null)}>
              <IconButton
                icon={ChevronLeft}
                label="Previous month"
                size="sm"
                className="absolute -top-1 left-0"
                onClick={() => setCursor((c) => c.subtract(1, "month"))}
              />
              <IconButton
                icon={ChevronRight}
                label="Next month"
                size="sm"
                className="absolute -top-1 right-0"
                onClick={() => setCursor((c) => c.add(1, "month"))}
                disabled={cursor.add(1, "month").isAfter(dayjs(), "month")}
              />
              {[cursor, cursor.add(1, "month")].map((m) => (
                <MonthGrid
                  key={m.format("YYYY-MM")}
                  month={m}
                  from={draft.from}
                  to={draft.to}
                  hover={draft.from && !draft.to ? hover : null}
                  onPick={pick}
                  onHover={setHover}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="num text-caption text-subtle">
                {draft.from ? `${formatDate(draft.from)} – ${draft.to ? formatDate(draft.to) : "…"}` : "Pick a start date"}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => close()}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabledReason={!draft.to ? "Pick an end date" : undefined}
                  onClick={() => {
                    onChange?.({ from: draft.from.format("YYYY-MM-DD"), to: draft.to.format("YYYY-MM-DD"), preset: null });
                    close();
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
}
