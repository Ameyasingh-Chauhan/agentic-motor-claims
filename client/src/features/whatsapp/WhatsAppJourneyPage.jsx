import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Download, FileArchive, FilePlus2, Globe, Mic, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { isCustomer } from "../../lib/permissions";
import { Button, IconButton } from "../../components/ui/Button";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { cn } from "../../lib/cn";
import { Reveal, RevealScope } from "../home/Reveal";
import { PhoneFrame } from "./PhoneFrame";
import { UnderTheHood } from "./UnderTheHood";
import { usePlayback } from "./usePlayback";
import { downloadKeyFrames, downloadScreen } from "./exportFrames";
import "./whatsapp.css";

const BENEFITS = [
  { icon: Mic, text: "Customers report in their own words — typed or a voice note in any Indian language." },
  { icon: Clock, text: "No app to install, no forms: the assistant asks only for what is missing." },
  { icon: Globe, text: "The same AI agents as the app run behind every message, with live checks and decisions." },
];

function usePhoneHeight() {
  const [h, setH] = useState(() => Math.max(480, window.innerHeight - 250));
  useEffect(() => {
    const on = () => setH(Math.max(480, window.innerHeight - 250));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

/** Scrubber with chapter markers (FNOL, Photos, Verification, Decision, Settlement). */
function Scrubber({ p, chapters }) {
  const pct = p.total ? (100 * p.time) / p.total : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-6">
        <input type="range" min={0} max={p.total} step={10} value={Math.round(p.time)} aria-label="Playback position"
          onChange={(e) => { p.pause(); p.seek(Number(e.target.value)); }}
          className="absolute inset-0 w-full cursor-pointer opacity-0" />
        <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        {chapters.map((ch) => (
          <span key={ch.key} className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-border-strong" style={{ left: `${(100 * p.schedule[ch.index].at) / p.total}%` }} aria-hidden="true" />
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {chapters.map((ch) => {
          const active = p.visible > ch.index && (chapters.find((c) => c.index > ch.index)?.index ?? Infinity) >= p.visible;
          return (
            <button key={ch.key} type="button" onClick={() => { p.pause(); p.showUpTo(ch.index); }}
              className={cn("h-7 rounded-full border px-3 text-caption transition-colors duration-150",
                active ? "border-accent bg-bg-muted font-semibold text-orange-700" : "border-border text-muted hover:text-text")}>
              {ch.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Player({ scenario, customer }) {
  const p = usePlayback(scenario.messages);
  const phone = useRef(null);
  const height = usePhoneHeight();
  const [busy, setBusy] = useState(false);
  const current = p.visible > 0 ? scenario.messages[p.visible - 1] : null;

  const exportScreen = async () => {
    try { await downloadScreen(phone.current, `whatsapp-${scenario.id}`); } catch (e) { toast.error(`Couldn't export the screen: ${e.message}`); }
  };
  const exportAll = async () => {
    setBusy(true);
    p.pause();
    const at = p.time;
    try {
      await downloadKeyFrames(phone.current, `whatsapp-${scenario.id}`, scenario, p.showUpTo);
      toast.success(`Saved ${scenario.chapters.length} key frames`);
    } catch (e) {
      toast.error(`Couldn't export key frames: ${e.message}`);
    } finally {
      p.seek(at);
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-12 items-start gap-6">
      <Reveal index={1} className="col-span-12 flex flex-col gap-4 xl:col-span-3">
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm" aria-label="Playback controls">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton icon={RotateCcw} label="Restart" onClick={p.restart} />
            <IconButton icon={SkipBack} label="Previous message" onClick={p.stepBack} disabled={p.visible === 0} />
            <Button size="sm" icon={p.playing ? Pause : Play} onClick={p.playing ? p.pause : p.play} className="w-24">{p.playing ? "Pause" : "Play"}</Button>
            <IconButton icon={SkipForward} label="Next message" onClick={p.stepForward} disabled={p.visible >= scenario.messages.length} />
            <span className="num ml-1 text-caption text-muted">{p.visible}/{scenario.messages.length}</span>
            <SegmentedControl size="sm" label="Speed" value={p.speed} onChange={p.setSpeed}
              options={[{ value: 0.5, label: "0.5×" }, { value: 1, label: "1×" }, { value: 2, label: "2×" }]} />
          </div>
          <Scrubber p={p} chapters={scenario.chapters} />
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button size="sm" variant="ghost" icon={Download} onClick={exportScreen} disabled={busy}>Screen as PNG</Button>
            <Button size="sm" variant="ghost" icon={FileArchive} onClick={exportAll} loading={busy}>Key frames (ZIP)</Button>
          </div>
        </section>
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-base font-semibold text-text">{scenario.title}</h2>
          <p className="mt-1 text-sm text-muted">{scenario.description}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted">Customer</dt><dd className="text-text">{scenario.customer_name}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Vehicle</dt><dd className="text-right text-text">{scenario.vehicle}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Registration</dt><dd className="mono text-text">{scenario.registration}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Claim</dt><dd><Link className="mono text-blue-600 hover:underline" to={`/claims/${scenario.claim_id}`}>{scenario.claim_id}</Link></dd></div>
          </dl>
        </section>
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-base font-semibold text-text">Why WhatsApp</h2>
          <ul className="mt-3 space-y-3">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-sm text-muted">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-tint-blue-bg text-tint-blue"><Icon size={16} aria-hidden="true" /></span>{text}
              </li>
            ))}
          </ul>
          <Button className="mt-4" variant="secondary" icon={FilePlus2} to="/file-claim" fullWidth>Try it in the app</Button>
        </section>
      </Reveal>

      <Reveal index={2} className="col-span-12 flex flex-col gap-4 lg:col-span-7 xl:col-span-5">
        <PhoneFrame ref={phone} messages={scenario.messages} visible={p.visible} typing={p.typing} playing={p.playing} activeIndex={p.visible - 1} maxHeight={height} />
      </Reveal>

      <Reveal index={3} className="col-span-12 lg:col-span-5 xl:col-span-4 xl:sticky xl:top-20">
        <UnderTheHood message={current} index={p.visible - 1} total={scenario.messages.length} customer={customer} />
      </Reveal>
    </div>
  );
}

/** WhatsApp Journey (§10.9): scripted replays of claims filed over WhatsApp, with what the agents did behind each message. */
export default function WhatsAppJourneyPage() {
  const customer = isCustomer(useAuthStore((s) => s.user));
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ["whatsapp", "scenarios"], queryFn: () => api("/whatsapp/scenarios"), staleTime: 5 * 60_000 });
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const id = params.get("scenario") && items.some((s) => s.id === params.get("scenario")) ? params.get("scenario") : items[0]?.id;
  const scenario = items.find((s) => s.id === id);

  return (
    <RevealScope id="whatsapp">
      <div className="flex flex-col gap-6">
        <Reveal index={0} className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text">WhatsApp Journey</h1>
            <p className="text-sm text-muted">{customer ? "Replays of your claims on WhatsApp — what you saw, and what happened behind each message."
              : "A claim filed end to end over WhatsApp, with the AI agents' work behind every message."}</p>
          </div>
          {items.length > 1 && (
            <SegmentedControl label="Scenario" value={id} onChange={(v) => setParams({ scenario: v }, { replace: true })}
              options={items.map((s) => ({ value: s.id, label: s.title }))} />
          )}
        </Reveal>
        {q.isPending ? (
          <div className="grid grid-cols-12 gap-6">
            <Skeleton className="col-span-3 h-96" rounded="lg" /><Skeleton className="col-span-5 h-144" rounded="lg" /><Skeleton className="col-span-4 h-96" rounded="lg" />
          </div>
        ) : q.isError ? (
          <ErrorState title="Couldn't load the WhatsApp replays" error={q.error} onRetry={() => q.refetch()} />
        ) : !scenario ? (
          <EmptyState title="No WhatsApp replays yet" description="Claims you file on WhatsApp will appear here as a replay."
            action={<Button icon={FilePlus2} to="/file-claim">File a claim in the app</Button>} />
        ) : (
          <Player key={scenario.id} scenario={scenario} customer={customer} />
        )}
      </div>
    </RevealScope>
  );
}
