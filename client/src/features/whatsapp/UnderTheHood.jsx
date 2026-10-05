import { Cpu, EyeOff, Lock, Timer } from "lucide-react";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { AGENTS } from "../home/constants";

const AGENT = Object.fromEntries(AGENTS.map((a) => [a.key, a]));
const LEVEL = { pass: "pass", warn: "warn", fail: "fail", pending: "pending" };
const ms = (v) => (v == null ? "" : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);

/** "Under the hood" (§10.9): what the agents did for the message on screen, synced to playback. Dark neutral panel (--panel-dark). */
export function UnderTheHood({ message, index, total, customer }) {
  const u = message?.under_the_hood;
  const agent = u?.agent ? AGENT[u.agent] : null;
  const Icon = agent?.icon ?? Cpu;
  return (
    <section aria-label="Under the hood" aria-live="polite" data-theme="dark" className="flex min-h-96 flex-col rounded-lg border border-border bg-panel-dark p-5 text-on-dark shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Under the hood</h2>
        <span className="num text-caption text-on-dark-muted">{message ? `Message ${index + 1} of ${total}` : "Press play"}</span>
      </header>
      {!message ? (
        <p className="mt-4 text-sm text-on-dark-muted">Each message shows which agent handled it, what it checked and how long it took.</p>
      ) : !u ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-on-dark-muted">
          {customer ? <><EyeOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Internal checks for this step are handled by our team.</>
            : <>Customer message — no agent step.</>}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-tint-blue-bg text-tint-blue"><Icon size={20} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-caption text-on-dark-muted">{agent ? `${agent.label} agent` : "Messaging platform"}</p>
              <p className="text-sm font-semibold">{u.title}</p>
            </div>
            {u.latency_ms != null && <span className="num ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-caption text-on-dark-muted"><Timer size={14} aria-hidden="true" />{ms(u.latency_ms)}</span>}
          </div>
          {u.internal && (
            <p className="inline-flex items-center gap-2 self-start rounded-full bg-warning-bg px-3 py-1 text-caption font-medium text-warning">
              <Lock size={12} aria-hidden="true" />Internal — never shown to the customer
            </p>
          )}
          {u.tools.length > 0 && (
            <ul className="flex flex-col gap-2">
              {u.tools.map((t, i) => (
                <li key={i} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="flex items-center gap-2">
                      {t.latency_ms != null && <span className="num text-caption text-on-dark-muted">{ms(t.latency_ms)}</span>}
                      <StatusFlag size="sm" level={LEVEL[t.level] ?? "pending"} label={{ pass: "OK", warn: "Check", fail: "Flag", pending: "N/A" }[t.level] ?? "N/A"} />
                    </span>
                  </div>
                  <p className="mt-1 text-caption text-on-dark-muted">{t.result}</p>
                </li>
              ))}
            </ul>
          )}
          {u.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-caption text-on-dark-muted">{u.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
