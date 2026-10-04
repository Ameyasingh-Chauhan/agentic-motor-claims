import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, Keyboard, Languages, Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDateTime } from "../../lib/format";
import { Field, Textarea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ACCIDENT_TYPES, INCIDENT_TILES, INTAKE_TILE, LANGUAGE_NAMES } from "./constants";
import { VoiceRecorder } from "./VoiceRecorder";

export function useCities() {
  return useQuery({ queryKey: ["wizard", "cities"], queryFn: () => api("/wizard/cities"), staleTime: Infinity });
}

/** Blue "AI-filled" marker with Confirm (§10.6 step 3). state: true (AI-filled) | "confirmed" | undefined. */
export function AiMark({ state, onConfirm }) {
  if (!state) return null;
  if (state === "confirmed") return <span className="inline-flex items-center gap-1 text-caption text-success"><Check size={14} aria-hidden="true" />Confirmed</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone="blue" icon={Sparkles}>AI-filled</Badge>
      {onConfirm && <button type="button" onClick={onConfirm} className="text-caption font-medium text-blue-600 underline-offset-2 hover:underline">Confirm</button>}
    </span>
  );
}

/** POST /api/intake/voice — multipart with the recording, or just the typed text. */
async function postIntake(claimId, file, text) {
  const form = new FormData();
  form.append("claim_id", claimId);
  if (file) form.append("file", file, file.name);
  if (text) form.append("text", text);
  const res = await fetch("/api/intake/voice", { method: "POST", body: form, credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(typeof data?.detail === "string" ? data.detail : data?.detail?.message || "The Intake agent is unavailable", res.status, data);
  return data;
}

function guessAccident(text) {
  const t = (text || "").toLowerCase();
  if (/behind|rear|from the back|peeche/.test(t)) return "rear_end";
  if (/park|pillar|scrap|basement/.test(t)) return "parking_scrape";
  if (/pothole|speed ?breaker|road hazard/.test(t)) return "pothole";
  if (/cow|dog|buffalo|animal|deer/.test(t)) return "animal";
  if (/skid|slipp|fell|fall/.test(t)) return "skid_fall";
  if (/side|door|swipe/.test(t)) return "side_swipe";
  if (/front|divider|head-on|bonnet|headlamp/.test(t)) return "front_collision";
  return null;
}

/** Fill only fields the user hasn't answered yet; mark each one AI-filled. */
export function applyIntake(intake, form, cities = []) {
  const patch = {}, filled = {};
  const set = (k, v) => { if (v != null && v !== "") { patch[k] = v; filled[k] = true; } };
  const tile = INTAKE_TILE[intake.incident_type];
  if (!form.incident_tile && tile) set("incident_tile", tile);
  if ((patch.incident_tile ?? form.incident_tile) === "accident" && !form.accident_type) set("accident_type", guessAccident(`${intake.cause} ${intake.translation_en}`));
  if (intake.incident_at && (intake.datetime_conf ?? 0) >= 0.5 && !form.date) {
    const d = new Date(intake.incident_at);
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
    set("date", `${p.year}-${p.month}-${p.day}`);
    set("time", `${p.hour}:${p.minute}`);
  }
  if (!form.location_text && intake.location_text) set("location_text", intake.location_text);
  const city = cities.find((c) => c.city.toLowerCase() === (intake.city || "").toLowerCase());
  if (!form.city && city) { set("city", city.city); patch.lat = city.lat; patch.lng = city.lng; }
  if (form.third_party == null && intake.third_party != null) set("third_party", Boolean(intake.third_party));
  if (!form.safe && intake.injuries && intake.injuries !== "unknown") set("safe", intake.injuries === "none" ? "yes" : "injured");
  if (form.police == null && intake.police_informed != null) set("police", intake.police_informed);
  if (!form.fir_number && intake.fir_number) set("fir_number", intake.fir_number);
  return { ...patch, ai_filled: { ...form.ai_filled, ...filled } };
}

const COUNTERPARTY = { truck: "Truck", car: "Car", "two-wheeler": "Two-wheeler", bus: "Bus", auto: "Auto-rickshaw", pedestrian: "Pedestrian", object: "Object", unknown: "Not stated" };
const INJURY = { none: "No injuries", minor: "Minor injuries", serious: "Serious injuries", fatal: "Fatal", unknown: "Not stated" };

function IntakeResult({ intake, form, update }) {
  const confirm = (k) => update({ ai_filled: { ...form.ai_filled, [k]: "confirmed" } });
  const lang = intake.language_label || intake.language_codes?.map((c) => LANGUAGE_NAMES[c] ?? c).join(" + ");
  const rows = [
    ["When", intake.incident_at ? formatDateTime(intake.incident_at) : "Not stated", "date"],
    ["Where", [intake.location_text, intake.city].filter(Boolean).join(", ") || "Not stated", "location_text"],
    ["Cause", intake.cause || "Not stated", "incident_tile"],
    ["Other party", COUNTERPARTY[intake.counterparty] ?? intake.counterparty, "third_party"],
    ["Injuries", INJURY[intake.injuries] ?? intake.injuries, "safe"],
    ["Parts mentioned", intake.parts_mentioned?.length ? intake.parts_mentioned.join(", ") : "None stated", null],
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col gap-4 rounded-lg border border-blue-600 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue" icon={Languages}>Detected: {lang}</Badge>
        <span className="text-caption text-muted">Read by the Intake agent</span>
      </div>
      {intake.transcript && (
        <div>
          <p className="mb-1 text-caption font-semibold text-muted uppercase">Original transcript</p>
          <p className="rounded-md bg-bg-subtle p-3 text-sm text-text">{intake.transcript}</p>
        </div>
      )}
      <div>
        <p className="mb-1 text-caption font-semibold text-muted uppercase">English translation</p>
        <p className="rounded-md bg-bg-subtle p-3 text-sm text-text">{intake.translation_en}</p>
      </div>
      <div>
        <p className="mb-2 text-caption font-semibold text-muted uppercase">What we understood — please check</p>
        <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {rows.map(([k, v, field]) => (
            <div key={k} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2">
              <dt className="flex items-center justify-between gap-2 text-caption text-muted">{k}{field && <AiMark state={form.ai_filled[field]} onConfirm={() => confirm(field)} />}</dt>
              <dd className="text-sm text-text">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {intake.follow_up?.length > 0 && (
        <div className="rounded-md bg-tint-blue-bg p-3">
          <p className="mb-1 text-caption font-semibold text-text">The assistant would also like to know</p>
          <ul className="list-disc pl-5 text-sm text-text">{intake.follow_up.map((q, i) => <li key={i}>{q.en ?? q.question_en ?? q.local ?? JSON.stringify(q)}</li>)}</ul>
        </div>
      )}
    </motion.div>
  );
}

export function StepIncident({ form, update, errors, draftId, onIntake }) {
  const cities = useCities();
  const [busy, setBusy] = useState(false);
  const send = async (file, text) => {
    setBusy(true);
    try {
      const res = await postIntake(draftId, file, text);
      if (res.intake) {
        update((f) => ({ ...applyIntake(res.intake, f, cities.data), intake: res.intake, narrative: f.input_mode === "voice" ? (res.intake.transcript || f.narrative) : f.narrative }));
        toast.success(`Statement read — ${res.intake.language_label}. Check the AI-filled fields.`);
      } else {
        toast.warning(res.message);
      }
      onIntake?.();
    } catch (e) {
      toast.error(e.message || "The Intake agent could not read that — please try again or type it");
    } finally {
      setBusy(false);
    }
  };
  const sub = form.incident_tile === "accident";
  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-text">What happened?</legend>
        <div role="radiogroup" aria-label="Incident type" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {INCIDENT_TILES.map((t) => {
            const sel = form.incident_tile === t.key;
            const Icon = t.icon;
            return (
              <motion.button key={t.key} type="button" role="radio" aria-checked={sel} whileTap={{ scale: 0.98 }}
                onClick={() => update({ incident_tile: t.key, accident_type: t.key === "accident" ? form.accident_type : null, ai_filled: { ...form.ai_filled, incident_tile: undefined } })}
                className={cn("flex min-h-24 flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors duration-150",
                  sel ? "border-primary bg-surface ring-1 ring-primary" : "border-border bg-surface hover:border-border-strong")}>
                <Icon size={22} aria-hidden="true" className={sel ? "text-orange-700" : "text-muted"} />
                <span className="text-sm font-medium text-text">{t.label}</span>
                <span className="text-caption text-muted">{t.hint}</span>
              </motion.button>
            );
          })}
        </div>
        {errors.incident_tile && <p className="mt-2 text-caption text-danger">{errors.incident_tile}</p>}
        <AnimatePresence>
          {sub && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-text">Kind of accident <AiMark state={form.ai_filled.accident_type} /></p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of accident">
                {ACCIDENT_TYPES.map((a) => (
                  <button key={a.value} type="button" role="radio" aria-checked={form.accident_type === a.value}
                    onClick={() => update({ accident_type: a.value, ai_filled: { ...form.ai_filled, accident_type: undefined } })}
                    className={cn("h-9 rounded-full border px-4 text-sm transition-colors duration-150",
                      form.accident_type === a.value ? "border-primary bg-primary text-on-primary" : "border-border-strong bg-surface text-text hover:bg-bg-subtle")}>{a.label}</button>
                ))}
              </div>
              {errors.accident_type && <p className="mt-2 text-caption text-danger">{errors.accident_type}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </fieldset>

      <section className="flex flex-col gap-4" aria-labelledby="desc-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="desc-h" className="text-sm font-medium text-text">Describe it in your own words</h3>
          <SegmentedControl label="How do you want to describe it?" size="sm" value={form.input_mode} onChange={(v) => update({ input_mode: v })}
            options={[{ value: "text", label: "Type", icon: Keyboard }, { value: "voice", label: "Speak", icon: Mic }]} />
        </div>
        {form.input_mode === "text" ? (
          <div className="flex flex-col gap-3">
            <Field label="What happened" labelHidden error={errors.narrative} hint="Any language is fine. Mention how it happened and what is damaged.">
              {(p) => <Textarea {...p} rows={6} value={form.narrative} onChange={(e) => update({ narrative: e.target.value, intake: null })}
                placeholder="e.g. A truck hit my car from behind near Khed Shivapur toll at 9 pm. The rear bumper and tail lamp are broken." />}
            </Field>
            <div className="flex items-center justify-between gap-3">
              <span className="num text-caption text-subtle">{form.narrative.length} / 4000</span>
              <Button variant="secondary" size="sm" icon={Sparkles} loading={busy} disabled={form.narrative.trim().length < 10}
                disabledReason={form.narrative.trim().length < 10 ? "Type at least 10 characters first" : undefined}
                onClick={() => send(null, form.narrative)}>Let AI read it and fill the details</Button>
            </div>
          </div>
        ) : (
          <>
            <VoiceRecorder disabled={busy} onReady={(f) => send(f)} />
            {busy && (
              <div className="flex items-center gap-3 rounded-md bg-tint-blue-bg px-4 py-3 text-sm text-text" role="status">
                <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-blue-600" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />)}</span>
                Intake agent is listening: detecting the language, transcribing and translating…
              </div>
            )}
            {errors.narrative && !busy && <p className="text-caption text-danger">{errors.narrative}</p>}
          </>
        )}
        {form.intake && <IntakeResult intake={form.intake} form={form} update={update} />}
      </section>
    </div>
  );
}
