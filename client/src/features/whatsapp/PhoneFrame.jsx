import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate } from "animejs";
import {
  BadgeCheck, CheckCheck, ChevronLeft, CircleCheck, Circle, CircleDot, FileText, List, MapPin, MessageCircle, Mic, MoreVertical,
  Paperclip, Phone, Play, Reply, Smile, Star, Video,
} from "lucide-react";
import { usePrefersReducedMotion } from "../../hooks/useReducedMotion";
import { formatINR } from "../../lib/format";
import { cn } from "../../lib/cn";

const time = (iso) => iso.slice(11, 16);

function Meta({ m, out }) {
  return (
    <span className="ml-2 inline-flex translate-y-1 items-center gap-1 float-right text-caption text-chat-meta">
      {time(m.ts)}
      {out && <CheckCheck size={14} className="text-chat-tick-read" aria-label="Read" />}
    </span>
  );
}

function Buttons({ items }) {
  return (
    <div className="mt-1 flex flex-col gap-1">
      {items.map((b) => (
        <span key={b} className="flex h-9 items-center justify-center gap-2 rounded-md bg-chat-in text-sm font-medium text-chat-action shadow-sm">
          <Reply size={14} aria-hidden="true" />{b}
        </span>
      ))}
    </div>
  );
}

/** One chat message (generic WhatsApp-style, no trademarked assets). Business = incoming (left); customer = outgoing (right). */
function Body({ m }) {
  const out = m.from === "customer";
  switch (m.type) {
    case "voice":
      return (
        <div className="w-60">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chat-action text-chat-on-action"><Play size={14} aria-hidden="true" /></span>
            <span className="flex h-8 flex-1 items-center gap-0.5" aria-hidden="true">
              {m.peaks.map((p, i) => <span key={i} className="w-1 rounded-full bg-chat-meta" style={{ height: `${Math.round(p * 100)}%` }} />)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-caption text-chat-meta">
            <span className="inline-flex items-center gap-1"><Mic size={12} aria-hidden="true" />0:{String(m.duration_s).padStart(2, "0")}</span>
            <Meta m={m} out={out} />
          </div>
          <p className="mt-1 line-clamp-2 border-t border-border pt-1 text-caption text-muted italic">“{m.transcript}”</p>
        </div>
      );
    case "images":
      return (
        <div className="w-60">
          <div className={cn("grid gap-1", m.images.length > 1 && "grid-cols-2")}>
            {m.images.slice(0, 4).map((im) => (
              <img key={im.url} src={im.thumb || im.url} alt="Claim photo" className={cn("w-full rounded-sm object-cover", m.images.length > 1 ? "aspect-square" : "aspect-video")}
                style={im.blur_data ? { backgroundImage: `url(${im.blur_data})`, backgroundSize: "cover" } : undefined} />
            ))}
          </div>
          {m.caption && <p className="mt-1 text-sm">{m.caption}</p>}
          <div className="mt-1 h-4"><Meta m={m} out={out} /></div>
        </div>
      );
    case "document":
      return (
        <div className="w-60">
          <div className="flex items-center gap-3 rounded-sm bg-bg-muted p-2">
            <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded-sm bg-danger text-chat-on-action"><FileText size={16} aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{m.name}</span>
              <span className="block text-caption text-chat-meta">{m.pages} page{m.pages === 1 ? "" : "s"} · {m.size_kb} KB · {m.name.split(".").pop().toUpperCase()}</span>
            </span>
          </div>
          <div className="mt-1 h-4"><Meta m={m} out={out} /></div>
        </div>
      );
    case "location":
      return (
        <div className="w-60">
          <div className="wa-map relative flex h-28 items-center justify-center rounded-sm" aria-hidden="true">
            <MapPin size={32} className="text-danger drop-shadow" fill="currentColor" />
          </div>
          <p className="mt-1 text-sm font-medium">{m.label}</p>
          <p className="text-caption text-chat-meta">{m.address}</p>
          <div className="h-4"><Meta m={m} out={out} /></div>
        </div>
      );
    case "list":
      return (
        <div className="w-60">
          <p className="text-sm whitespace-pre-line">{m.text}</p>
          <div className="mt-2 flex h-9 items-center justify-center gap-2 border-t border-border text-sm font-medium text-chat-action"><List size={14} aria-hidden="true" />{m.button}</div>
          <ul className="mt-1 space-y-1 rounded-sm bg-bg-muted p-2 text-caption">
            {m.rows.map((r) => (
              <li key={r.title} className="flex items-center gap-2">
                {r.title === m.chosen ? <CircleDot size={12} className="text-chat-action" aria-label="Chosen" /> : <Circle size={12} className="text-chat-meta" aria-hidden="true" />}
                <span><span className="font-medium">{r.title}</span> · <span className="text-chat-meta">{r.description}</span></span>
              </li>
            ))}
          </ul>
          <div className="h-4"><Meta m={m} out={out} /></div>
        </div>
      );
    case "template":
      return (
        <div className="w-64">
          <p className="text-sm font-semibold">{m.header}</p>
          <p className="mt-1 text-sm whitespace-pre-line">{m.body}</p>
          <p className="mt-1 text-caption text-chat-meta">{m.footer}<Meta m={m} out={out} /></p>
        </div>
      );
    case "status":
      return (
        <div className="w-60">
          <p className="text-sm font-semibold">{m.title}</p>
          <p className="mono text-caption text-chat-meta">{m.claim_id}</p>
          <ol className="mt-2 space-y-1">
            {m.steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                {s.state === "done" ? <CircleCheck size={16} className="text-success" aria-label="Done" />
                  : s.state === "current" ? <CircleDot size={16} className="text-chat-action" aria-label="In progress" />
                  : <Circle size={16} className="text-chat-meta" aria-label="Upcoming" />}
                <span className={s.state === "todo" ? "text-chat-meta" : ""}>{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="h-4"><Meta m={m} out={out} /></div>
        </div>
      );
    case "payment":
      return (
        <div className="w-60">
          <p className="text-caption font-semibold tracking-wide text-success uppercase">Payment completed</p>
          <p className="num text-2xl font-bold">{formatINR(m.amount)}</p>
          <p className="text-sm">to {m.payee}</p>
          <dl className="mt-2 space-y-1 border-t border-border pt-2 text-caption">
            <div className="flex justify-between gap-2"><dt className="text-chat-meta">Mode</dt><dd>{m.mode}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-chat-meta">Reference</dt><dd className="mono">{m.reference}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-chat-meta">You paid</dt><dd className="num">{formatINR(m.you_pay)} deductible</dd></div>
          </dl>
          <div className="h-4"><Meta m={m} out={out} /></div>
        </div>
      );
    case "rating":
      return (
        <div className="w-60">
          <p className="text-sm">{m.text}</p>
          <div className="mt-2 flex gap-1" aria-label={`${m.stars} of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={22} className={i <= m.stars ? "text-warning" : "text-chat-meta"} fill={i <= m.stars ? "currentColor" : "none"} aria-hidden="true" />)}
          </div>
          {m.comment && <p className="mt-1 text-caption text-chat-meta">“{m.comment}”</p>}
          <div className="h-4"><Meta m={m} out={out} /></div>
        </div>
      );
    default:   // text, quick_replies
      return <p className="max-w-64 text-sm whitespace-pre-line">{m.text}<Meta m={m} out={out} /></p>;
  }
}

function Message({ m, active, animateIn }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const out = m.from === "customer";
  useEffect(() => {   // anime.js owns the bubble entrance (Motion is not used on these elements)
    if (!animateIn || !ref.current) return;
    animate(ref.current, reduced ? { opacity: [0, 1], duration: 120 } : { opacity: [0, 1], translateY: [10, 0], duration: 240, ease: "outQuad" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const card = m.type === "template";
  return (
    <div ref={ref} className={cn("flex flex-col", out ? "items-end" : "items-start")}>
      <div className={cn("rounded-md px-2 py-1.5 text-text shadow-sm transition-shadow duration-200", out ? "bg-chat-out" : "bg-chat-in",
        active && "ring-2 ring-blue-600", card && "px-3 py-2")}>
        <Body m={m} />
      </div>
      {(m.type === "quick_replies" || m.type === "template") && <div className="mt-1 w-64"><Buttons items={m.buttons} /></div>}
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-start" aria-label="Typing">
      <span className="flex h-8 items-center gap-1 rounded-md bg-chat-in px-3 shadow-sm">
        {[0, 1, 2].map((i) => <span key={i} className="wa-dot h-1.5 w-1.5 rounded-full bg-chat-meta" style={{ animationDelay: `${i * 150}ms` }} />)}
      </span>
    </div>
  );
}

/** Phone (390 × 800, scaled to fit the available height) with a generic WhatsApp-style chat. */
export const PhoneFrame = forwardRef(function PhoneFrame({ messages, visible, typing, playing, activeIndex, maxHeight }, ref) {
  const scroller = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => setScale(Math.min(1, maxHeight / 820)), [maxHeight]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: playing ? "smooth" : "auto" });
  }, [visible, typing, playing]);

  return (
    <div className="mx-auto" style={{ width: 390 * scale, height: 820 * scale }}>
      <div ref={ref} className="origin-top-left overflow-hidden rounded-xl border-8 border-panel-dark bg-chat-bg shadow-lg ring-1 ring-border" style={{ width: 390, height: 820, transform: `scale(${scale})` }}>
        <div className="flex h-7 items-center justify-between bg-chat-header px-5 text-caption text-chat-header-text" aria-hidden="true">
          <span className="num">{messages[Math.max(0, visible - 1)]?.ts.slice(11, 16) ?? "09:41"}</span><span>5G ▮▮▮ 82%</span>
        </div>
        <header className="flex h-14 items-center gap-2 bg-chat-header px-2 text-chat-header-text">
          <ChevronLeft size={22} aria-hidden="true" />
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chat-header-text/20"><MessageCircle size={18} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-base font-semibold">ABC Insurance <BadgeCheck size={16} aria-label="Verified business" /></span>
            <span className="block text-caption opacity-80">{typing ? "typing…" : "Motor Claims · business account"}</span>
          </span>
          <Video size={18} aria-hidden="true" /><Phone size={18} className="mx-2" aria-hidden="true" /><MoreVertical size={18} aria-hidden="true" />
        </header>
        <div ref={scroller} className="wa-wallpaper flex flex-col gap-2 overflow-y-auto px-3 py-3" style={{ height: 820 - 28 - 56 - 56 - 16 }} aria-live="polite">
          <span className="mx-auto rounded-sm bg-chat-in px-2 py-0.5 text-caption text-chat-meta shadow-sm">
            Messages are end-to-end encrypted · demo replay
          </span>
          {messages.slice(0, visible).map((m, i) => (
            <Message key={m.id} m={m} active={i === activeIndex} animateIn={playing && i === visible - 1} />
          ))}
          {typing && <Typing />}
        </div>
        <footer className="flex h-14 items-center gap-2 px-2" aria-hidden="true">
          <span className="flex h-10 flex-1 items-center gap-2 rounded-full bg-chat-in px-3 text-sm text-chat-meta shadow-sm"><Smile size={18} />Message<Paperclip size={18} className="ml-auto" /></span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chat-action text-chat-on-action"><Mic size={18} /></span>
        </footer>
      </div>
    </div>
  );
});
