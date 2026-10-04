import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Checkbox } from "../../components/ui/Checkbox";
import { cn } from "../../lib/cn";
import { formatINR, toIST } from "../../lib/format";
import { ACTION_META, INFO_ITEMS } from "./claimModel";

function initialFields(action, claim) {
  const f = claim.financials;
  if (action === "approve_revised") return { amount: f?.net_payable ?? (claim.garage_quote || "") };
  if (action === "settle") return { amount: claim.amount_approved || "", date: toIST(new Date()).format("YYYY-MM-DD"), payment_reference: "" };
  if (action === "request_info") return { items: [] };
  return {};
}

/**
 * Confirm modal for a handler action (§10.4 A): preset reasons + a required reason, the action's own fields, an effect preview,
 * and server field errors shown on the matching input. Confirming hands the body to `onConfirm` (optimistic update happens there).
 */
export function ActionModal({ action, claim, people, onClose, onConfirm, pending, error }) {
  const meta = ACTION_META[action];
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState(() => initialFields(action, claim));
  const [touched, setTouched] = useState(false);
  const reasonRef = useRef(null);
  useEffect(() => { setReason(""); setFields(initialFields(action, claim)); setTouched(false); }, [action]); // eslint-disable-line react-hooks/exhaustive-deps

  const serverFields = error?.body?.detail?.fields ?? {};
  const isNote = action === "note";
  const localErrors = useMemo(() => {
    const e = {};
    if (!isNote && reason.trim().length < 5) e.reason = "Give a reason (at least 5 characters)";
    if (isNote && (fields.text ?? "").trim().length < 2) e.text = "Write the note";
    if (meta?.fields?.includes("amount") && !(Number(fields.amount) > 0)) e.amount = "Enter an amount";
    if (meta?.fields?.includes("payment_reference") && (fields.payment_reference ?? "").trim().length < 4) e.payment_reference = "Enter the UTR / cheque number";
    if (meta?.fields?.includes("items") && !(fields.items ?? []).length) e.items = "Choose at least one item";
    if (meta?.fields?.includes("assignee") && !fields.assignee) e.assignee = "Choose a handler";
    return e;
  }, [reason, fields, meta, isNote]);
  const err = (k) => (touched && localErrors[k]) || serverFields[k];

  if (!meta) return null;
  const set = (k) => (v) => setFields((f) => ({ ...f, [k]: v }));
  const toggleItem = (item) => setFields((f) => ({ ...f, items: f.items.includes(item) ? f.items.filter((i) => i !== item) : [...f.items, item] }));
  const assignees = Object.entries(people ?? {}).filter(([uid]) => uid !== claim.assignee).map(([value, label]) => ({ value, label }));

  const submit = (e) => {
    e?.preventDefault();
    setTouched(true);
    if (Object.keys(localErrors).length) return;
    const body = { action, reason: isNote ? fields.text : reason.trim() };
    if (fields.amount !== undefined && meta.fields?.includes("amount")) body.amount = Number(fields.amount);
    if (meta.fields?.includes("date")) body.date = fields.date;
    if (meta.fields?.includes("payment_reference")) body.payment_reference = fields.payment_reference.trim();
    if (meta.fields?.includes("items")) body.items = fields.items;
    if (meta.fields?.includes("assignee")) body.assignee = fields.assignee;
    if (isNote) body.text = fields.text;
    onConfirm(body);
  };

  const quote = claim.financials?.garage_quote ?? claim.garage_quote;
  return (
    <Modal
      open
      onClose={onClose}
      title={`${meta.label} · ${claim.id}`}
      description={isNote ? "Visible to claims staff only." : "Choose or write a reason. It is recorded in the audit log."}
      initialFocusRef={reasonRef}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={meta.variant === "danger" ? "danger" : "primary"} icon={meta.icon} loading={pending} onClick={submit}>
            {isNote ? "Add note" : `Confirm · ${meta.label}`}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {meta.fields?.includes("amount") && (
          <Field label={action === "settle" ? "Settled amount (₹)" : "Approved amount (₹)"} required error={err("amount")}
            hint={action === "approve_revised" ? `AI estimate ${formatINR(claim.financials?.net_payable)}${quote ? ` · garage quote ${formatINR(quote)}` : ""}` : undefined}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={1} value={fields.amount} onChange={(e) => set("amount")(e.target.value)} />}
          </Field>
        )}
        {meta.fields?.includes("date") && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Payment date" required error={err("date")}>
              {(p) => <Input {...p} type="date" value={fields.date} max={toIST(new Date()).format("YYYY-MM-DD")} onChange={(e) => set("date")(e.target.value)} />}
            </Field>
            <Field label="Payment reference" required error={err("payment_reference")} hint="UTR or cheque number">
              {(p) => <Input {...p} value={fields.payment_reference} onChange={(e) => set("payment_reference")(e.target.value)} className="mono" />}
            </Field>
          </div>
        )}
        {meta.fields?.includes("items") && (
          <fieldset>
            <legend className="text-sm font-medium text-text">What do you need from the customer? <span className="text-danger">*</span></legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {INFO_ITEMS.map((item) => (
                <Checkbox key={item} label={item} checked={fields.items.includes(item)} onChange={() => toggleItem(item)} />
              ))}
            </div>
            {err("items") && <p className="mt-1 text-caption text-danger">{err("items")}</p>}
          </fieldset>
        )}
        {meta.fields?.includes("assignee") && (
          <Field label="Assign to" required error={err("assignee")}>
            {(p) => <Select {...p} options={assignees} value={fields.assignee} onChange={set("assignee")} placeholder="Choose a handler…" />}
          </Field>
        )}
        {isNote ? (
          <Field label="Note" required error={err("text")}>
            {(p) => <Textarea {...p} ref={reasonRef} rows={4} value={fields.text ?? ""} onChange={(e) => set("text")(e.target.value)} />}
          </Field>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium text-text">Common reasons</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {meta.presets.map((p) => (
                  <button key={p} type="button" onClick={() => setReason(p)} aria-pressed={reason === p}
                    className={cn("rounded-full border px-3 py-1 text-caption transition-colors duration-150",
                      reason === p ? "border-primary bg-tint-orange-bg text-text" : "border-border text-muted hover:border-border-strong hover:text-text")}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Reason" required error={err("reason")}>
              {(p) => <Textarea {...p} ref={reasonRef} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you taking this action?" />}
            </Field>
          </>
        )}
        <p className="flex items-start gap-2 rounded-md bg-tint-blue-bg px-3 py-2 text-sm text-text">
          <Info size={16} className="mt-0.5 shrink-0 text-tint-blue" aria-hidden="true" />
          <span>{meta.preview(claim, fields, people)}{!isNote && " You can undo for 6 seconds."}</span>
        </p>
        {error && !Object.keys(serverFields).length && <p className="text-sm text-danger" role="alert">{error.message}</p>}
      </form>
    </Modal>
  );
}
