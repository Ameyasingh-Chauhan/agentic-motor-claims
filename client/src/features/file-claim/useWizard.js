import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { claimKey } from "../claims/useClaim";
import { EMPTY_FORM, claimTypeOf, incidentType, tileOf } from "./constants";

const NEW_KEY = "amc:wizard:new";
const SAVE_MS = 800;

function readNew() {
  try { return JSON.parse(sessionStorage.getItem(NEW_KEY) || "null"); } catch { return null; }
}
function writeNew(v) {
  try { if (v) sessionStorage.setItem(NEW_KEY, JSON.stringify(v)); else sessionStorage.removeItem(NEW_KEY); } catch { /* storage blocked */ }
}

/** Rebuild the form from a draft: the wizard's saved UI state, with the claim's own fields as the source of truth where they exist. */
export function formFromClaim(claim) {
  const saved = claim.wizard?.form ?? {};
  // Date/time come only from the wizard's own state: a new draft's server-side default time is "now", not an answer.
  const { tile, sub } = tileOf(claim.wizard?.incident_chosen ? claim.incident.type : null);
  return {
    ...EMPTY_FORM, ...saved,
    customer_id: claim.customer_id, customer_name: claim.customer_name, policy_no: claim.policy_no,
    incident_tile: saved.incident_tile ?? tile, accident_type: saved.accident_type ?? sub,
    settlement_mode: saved.settlement_mode ?? null,
    garage_id: claim.settlement?.mode === "cashless" ? claim.settlement?.garage_id ?? saved.garage_id : saved.garage_id,
  };
}

/** PATCH body for the draft from the form (only what the form actually holds). */
export function toPatch(form, step) {
  const type = incidentType(form);
  const incident = {
    ...(type ? { type } : {}),
    ...(form.date && form.time ? { datetime: `${form.date}T${form.time}:00` } : {}),
    location_text: [form.location_text, form.road].map((s) => s?.trim()).filter(Boolean).join(", "),
    ...(form.city ? { city: form.city } : {}),
    ...(form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : {}),
    ...(form.input_mode === "text" ? { narrative: form.narrative } : {}),
    third_party_involved: form.third_party === true || form.incident_tile === "third_party",
    injuries: form.safe === "injured",
    fir: form.police && form.fir_number ? { number: form.fir_number, station: form.fir_station } : {},
  };
  const body = {
    claim_type: claimTypeOf(form.incident_tile),
    incident,
    wizard: { step, form, incident_chosen: Boolean(type), financed: form.financed, major_accident: form.safe === "injured" },
  };
  const mode = form.incident_tile === "theft" ? "reimbursement" : form.settlement_mode; // theft settles on IDV to the bank
  if (mode) body.settlement_mode = mode;
  if (mode === "cashless" && form.garage_id) body.garage_id = form.garage_id;
  if (mode === "reimbursement") {
    const b = form.bank;
    body.bank = { account_name: b.account_name || null, account_last4: b.account_last4 || null, ifsc: b.ifsc ? b.ifsc.toUpperCase() : null, bank_name: b.bank_name || null };
  }
  const quote = Number(String(form.garage_quote).replace(/[^\d.]/g, ""));
  if (quote > 0) body.garage_quote = quote;
  return body;
}

/**
 * Wizard state: the draft id and step live in the URL (refresh-safe, deep-linkable); the form autosaves to the draft
 * (PATCH, debounced 800 ms) and before a draft exists to sessionStorage. Returns the draft claim query too.
 */
export function useWizard() {
  const [params, setParams] = useSearchParams();
  const draftId = params.get("draft");
  const step = params.get("step");
  const qc = useQueryClient();
  const draft = useQuery({
    queryKey: claimKey(draftId),
    queryFn: ({ signal }) => api(`/claims/${encodeURIComponent(draftId)}`, { signal }),
    enabled: Boolean(draftId),
    staleTime: Infinity,
    retry: 1,
  });
  const [form, setForm] = useState(() => (draftId ? null : { ...EMPTY_FORM, ...(readNew() ?? {}) }));
  const [save, setSave] = useState({ state: "idle", at: null, error: null });
  const timer = useRef(null);
  const latest = useRef({ form, step, draftId });
  latest.current = { form, step, draftId };
  const loadedFor = useRef(null);

  // Hydrate once per draft from the server copy.
  useEffect(() => {
    if (draftId && draft.data && loadedFor.current !== draftId) {
      loadedFor.current = draftId;
      setForm(formFromClaim(draft.data));
      setSave({ state: "saved", at: draft.data.updated_at, error: null });
    }
  }, [draftId, draft.data]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = null;
    const { form: f, step: s, draftId: id } = latest.current;
    if (!id || !f) return null;
    setSave((p) => ({ ...p, state: "saving" }));
    try {
      const claim = await api(`/claims/${id}`, { method: "PATCH", body: toPatch(f, s) });
      qc.setQueryData(claimKey(id), (old) => ({ ...(old ?? {}), ...claim }));
      setSave({ state: "saved", at: new Date().toISOString(), error: null });
      return claim;
    } catch (e) {
      setSave((p) => ({ ...p, state: "error", error: e }));
      return null;
    }
  }, [qc]);

  const update = useCallback((patch) => {
    setForm((f) => {
      const next = { ...f, ...(typeof patch === "function" ? patch(f) : patch) };
      if (!latest.current.draftId) writeNew(next);
      return next;
    });
    if (latest.current.draftId) {
      clearTimeout(timer.current);
      setSave((p) => ({ ...p, state: "pending" }));
      timer.current = setTimeout(flush, SAVE_MS);
    }
  }, [flush]);

  useEffect(() => () => clearTimeout(timer.current), []);
  // Save the step position too.
  useEffect(() => { if (draftId && form && loadedFor.current === draftId) update({}); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // One navigation per change: two functional setParams calls in the same tick would each start from the old URL.
  const goTo = useCallback((key, extra = {}) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set("step", key); Object.entries(extra).forEach(([k, v]) => n.set(k, v)); return n; });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setParams]);

  const startDraft = useCallback(async ({ policy_no, garage_id, form: override }) => {
    const f = override ?? latest.current.form;
    const claim = await api("/claims", { method: "POST", body: { policy_no, channel: "app", ...(garage_id ? { garage_id } : {}) } });
    qc.setQueryData(claimKey(claim.id), claim);
    loadedFor.current = claim.id;
    writeNew(null);
    const next = { ...f, policy_no, customer_id: claim.customer_id, customer_name: claim.customer_name };
    latest.current = { ...latest.current, form: next, draftId: claim.id };
    setForm(next);
    return claim;   // the caller navigates (goTo(step, { draft: claim.id }))
  }, [qc]);

  const reset = useCallback((next = {}) => {
    writeNew(null);
    loadedFor.current = null;
    setForm({ ...EMPTY_FORM, ...next });
    setSave({ state: "idle", at: null, error: null });
  }, []);

  const refreshDraft = useCallback(() => draftId && qc.invalidateQueries({ queryKey: claimKey(draftId) }), [qc, draftId]);

  return { draftId, draft, step, form, update, flush, save, goTo, startDraft, reset, setParams, refreshDraft };
}
