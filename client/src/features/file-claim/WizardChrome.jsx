import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, CloudCheck, CloudOff, LoaderCircle, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDate, formatINRCompact } from "../../lib/format";
import { LANGUAGE_NAMES } from "./constants";
import { placeText } from "./rules";

/** Vertical stepper (§10.6): status ticks, current step orange; reached steps are clickable. */
export function VerticalStepper({ steps, current, furthest, issuesFor, onStep }) {
  return (
    <nav aria-label="Claim steps">
      <ol className="flex flex-col">
        {steps.map((s, i) => {
          const done = i < current || (i <= furthest && i !== current && issuesFor(s.key).length === 0);
          const state = i === current ? "current" : done ? "done" : i <= furthest ? "reached" : "upcoming";
          const clickable = i <= furthest && i !== current;
          const Tag = clickable ? "button" : "div";
          return (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={state === "current" ? "step" : undefined}>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="absolute top-9 bottom-1 left-4 w-0.5 -translate-x-1/2 bg-border">
                  <span className="block h-full w-full origin-top bg-primary transition-transform duration-300 ease-standard"
                    style={{ transform: `scaleY(${i < furthest ? 1 : 0})` }} />
                </span>
              )}
              <Tag type={clickable ? "button" : undefined} onClick={clickable ? () => onStep(s.key) : undefined}
                className={cn("flex min-w-0 items-start gap-3 rounded-md text-left", clickable && "cursor-pointer hover:bg-bg-subtle")}>
                <span className={cn(
                  "num relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors duration-200",
                  state === "done" && "border-primary bg-primary text-on-primary",
                  state === "current" && "border-primary bg-surface text-orange-700",
                  state === "reached" && "border-warning bg-surface text-warning",
                  state === "upcoming" && "border-border-strong bg-surface text-subtle",
                )}>
                  {state === "done" ? <Check size={16} aria-hidden="true" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col pt-1">
                  <span className={cn("text-sm font-medium", state === "upcoming" ? "text-subtle" : "text-text")}>{s.label}</span>
                  <span className="text-caption text-subtle">{state === "reached" ? "Needs attention" : s.description}</span>
                  <span className="sr-only">{state === "done" ? "(completed)" : state === "current" ? "(current step)" : ""}</span>
                </span>
              </Tag>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : "earlier";
}

/** "Saved · 2 s ago" autosave indicator (polite live region). */
export function SaveIndicator({ save, hasDraft }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  let icon = CloudCheck, text = "Not saved yet — saves once your policy is chosen", tone = "text-subtle";
  if (hasDraft) {
    if (save.state === "saving" || save.state === "pending") { icon = LoaderCircle; text = "Saving…"; tone = "text-muted"; }
    else if (save.state === "error") { icon = CloudOff; text = "Couldn't save — retrying on your next change"; tone = "text-danger"; }
    else if (save.at) { text = `Saved · ${ago(save.at)}`; tone = "text-muted"; }
    else text = "Draft created";
  }
  const Icon = icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-caption", tone)} role="status" aria-live="polite">
      <Icon size={14} aria-hidden="true" className={icon === LoaderCircle ? "animate-spin" : undefined} />{text}
    </span>
  );
}

const TIPS = {
  policyholder: ["Search by name, phone, city, policy number or registration.", "Rahul Sharma is pinned at the top for demos."],
  policy: ["You can type the policy number or the registration, e.g. MH 12 AB 1234.", "An expired policy can't be claimed on — renew it first."],
  safety: ["If anyone is hurt, call 112 first. Your claim can wait.", "Third-party details help us recover costs from their insurer."],
  incident: ["Speak in any Indian language — Hindi, Marathi, Tamil, a mix… I'll transcribe and translate it.", "Mention the parts that are damaged and how it happened."],
  when: ["Report as soon as you can — claims reported within 7 days are faster.", "“Use my current location” works offline from our city list."],
  photos: ["Stand 2–3 metres back for the full-side shots, with the number plate readable.", "Good light, no zoom. I'll warn you if a photo looks blurry."],
  documents: ["RC and driving licence are read automatically as you upload them.", "Cashless at a network garage is the fastest way to get repaired."],
  review: ["Check each card — use Edit to change anything.", "After you submit, you'll watch our AI agents process the claim live."],
};

/** Assistant panel: contextual guidance + "Captured so far". */
export function AssistantPanel({ stepKey, form, claim, policy, photoCount, docCount }) {
  const items = [
    form.customer_name && ["Policyholder", form.customer_name],
    policy && ["Vehicle", `${policy.vehicle.make} ${policy.vehicle.model} · ${policy.vehicle.registration}`],
    policy && ["Cover", `${policy.cover} · IDV ${formatINRCompact(policy.idv)}`],
    form.safe && ["Safety", form.safe === "yes" ? "Everyone safe" : "Someone injured"],
    claim?.incident?.label && claim?.wizard?.incident_chosen && ["Incident", claim.incident.label],
    form.intake?.language_label && ["Language", form.intake.language_label],
    !form.intake && form.narrative && ["Statement", `${form.narrative.trim().split(/\s+/).length} words typed`],
    form.date && ["When", `${formatDate(form.date)} · ${form.time}`],
    form.city && ["Where", placeText(form.location_text, form.city)],
    photoCount > 0 && ["Photos", `${photoCount} uploaded`],
    docCount > 0 && ["Documents", `${docCount} uploaded`],
    form.settlement_mode && ["Settlement", form.settlement_mode === "cashless" ? `Cashless${claim?.garage_name ? ` · ${claim.garage_name}` : ""}` : "Reimbursement"],
  ].filter(Boolean);
  return (
    <aside aria-label="Assistant" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint-blue-bg text-tint-blue"><Sparkles size={20} aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Claims assistant</p>
          <p className="text-caption text-muted">AI guidance for this step</p>
        </div>
      </div>
      <motion.ul key={stepKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-2">
        {(TIPS[stepKey] ?? []).map((t) => (
          <li key={t} className="rounded-md bg-bg-subtle px-3 py-2 text-sm text-text">{t}</li>
        ))}
        {stepKey === "incident" && form.intake?.language_codes && (
          <li className="rounded-md bg-tint-blue-bg px-3 py-2 text-sm text-text">Detected {form.intake.language_label || LANGUAGE_NAMES[form.intake.language_codes[0]]}. Check the blue “AI-filled” fields.</li>
        )}
      </motion.ul>
      <div>
        <p className="mb-2 text-caption font-semibold tracking-wide text-muted uppercase">Captured so far</p>
        {items.length === 0 ? <p className="text-sm text-subtle">Nothing yet — your answers will appear here.</p> : (
          <ul className="flex flex-col gap-1.5">
            {items.map(([k, v]) => (
              <motion.li key={k} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted">{k}</span><span className="min-w-0 truncate text-right text-text" title={v}>{v}</span>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
