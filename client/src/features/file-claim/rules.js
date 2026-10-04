import { PHOTO_SLOTS, incidentType } from "./constants";

/** Local date/time strings in IST for <input type=date/time>. */
export function istNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function incidentDate(form) {
  return form.date && form.time ? new Date(`${form.date}T${form.time}:00+05:30`) : null;
}

export function daysAgo(form) {
  const d = incidentDate(form);
  return d ? (Date.now() - d.getTime()) / 86_400_000 : null;
}

export const photosOf = (claim) => (claim?.media ?? []).filter((m) => m.kind === "photo");
export const visibleSlots = (form) => PHOTO_SLOTS.filter((s) => !s.need || s.need(form));

/**
 * What still blocks each step: [{ field, message }]. Used for inline errors, the Next button's reason and the Review checklist.
 * `ctx` = { admin, claim, policy, requirements, uploading }.
 */
export function stepIssues(key, form, ctx = {}) {
  const out = [];
  const add = (field, message) => out.push({ field, message });
  if (key === "policyholder" && !form.customer_id) add("customer", "Choose the policyholder");
  if (key === "policy") {
    if (!form.policy_no) add("policy", "Choose or look up a policy");
    else if (ctx.policy?.expired) add("policy", "This policy has expired — choose an active policy");
  }
  if (key === "safety") {
    if (!form.safe) add("safe", "Tell us whether everyone is safe");
    if (form.third_party == null) add("third_party", "Was a third party involved?");
    if (form.police == null) add("police", "Were the police informed?");
  }
  if (key === "incident") {
    if (!form.incident_tile) add("incident_tile", "Choose what happened");
    else if (!incidentType(form)) add("accident_type", "Choose the kind of accident");
    const text = form.input_mode === "voice" ? (form.intake?.translation_en || form.narrative) : form.narrative;
    if (form.input_mode === "voice" && !form.intake && !(form.narrative || "").trim()) add("narrative", "Record a voice note (or switch to typing)");
    else if ((text || "").trim().length < 10) add("narrative", "Describe what happened (at least 10 characters)");
  }
  if (key === "when") {
    const d = incidentDate(form);
    if (!d) add("date", "Enter the date and time");
    else if (d.getTime() > Date.now() + 5 * 60_000) add("date", "The incident time cannot be in the future");
    if (!form.city) add("city", "Choose the city");
    if (!form.location_text.trim()) add("location_text", "Enter the area or landmark");
  }
  if (key === "photos") {
    if (ctx.uploading) add("photos", "Wait for the uploads to finish");
    if (form.incident_tile !== "theft" && photosOf(ctx.claim).length === 0) add("photos", "Add at least one photo of the damage");
  }
  if (key === "documents") {
    if (ctx.uploading) add("documents", "Wait for the uploads to finish");
    const missing = missingDocs(ctx.requirements);
    if (missing.length && !form.docs_later) add("documents", `Upload ${missing.join(", ")} — or tick "I'll provide these later"`);
    if (!form.settlement_mode && form.incident_tile !== "theft") add("settlement", "Choose cashless repair or reimbursement");
    if (form.settlement_mode === "cashless" && !form.garage_id) add("garage", "Choose a network garage");
    if (form.settlement_mode === "reimbursement" || form.incident_tile === "theft") {
      const b = form.bank;
      if (!b.account_name.trim() || !/^\d{4}$/.test(b.account_last4) || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(b.ifsc)) add("bank", "Enter the bank details (name, last 4 digits, IFSC)");
    }
  }
  if (key === "review" && !form.consent) add("consent", "Tick the declaration");
  return out;
}

/** Required, non-digital checklist items with no upload. */
export function missingDocs(requirements) {
  if (!requirements) return [];
  return [...requirements.groups.mandatory, ...requirements.groups.situation]
    .filter((i) => i.required && !i.digital && i.uploaded.length === 0).map((i) => i.label);
}

/** "Baner Road, Pune" + "Pune" → "Baner Road, Pune": joins place parts, skipping any already contained in the text so far. */
export function placeText(...parts) {
  return parts.filter(Boolean).reduce((s, p) => (s.toLowerCase().includes(String(p).toLowerCase()) ? s : s ? `${s}, ${p}` : String(p)), "");
}
