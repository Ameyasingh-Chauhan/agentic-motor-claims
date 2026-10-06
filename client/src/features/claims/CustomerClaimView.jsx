import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileUp, MessageSquareReply, Paperclip, X } from "lucide-react";
import { Tabs } from "../../components/ui/Tabs";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Field, Textarea } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Stepper } from "../../components/ui/Stepper";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { formatBytes, formatDate, formatINR } from "../../lib/format";
import { CUSTOMER_TABS, DOC_STATUS } from "./claimModel";
import { ClaimHeader, useBackToClaims } from "./ClaimHeader";
import { useRespondToRequest } from "./useClaim";
import { OverviewTab } from "./tabs/OverviewTab";
import { TimelineTab } from "./tabs/TimelineTab";
import { MediaTab } from "./tabs/MediaTab";
import { CommsTab } from "./tabs/CommsTab";

const STEPS = [
  { key: "submitted", label: "Claim submitted" }, { key: "review", label: "We review it" }, { key: "decision", label: "Decision" },
  { key: "repair", label: "Repair or payment" }, { key: "done", label: "Settled" },
];
const STEP_OF = { DRAFT: 0, SUBMITTED: 1, PROCESSING: 1, INFO_REQUESTED: 1, UNDER_REVIEW: 1, SIU_INVESTIGATION: 1, APPROVED: 3, PREAUTH_ISSUED: 3,
  DECLINED: 2, FRAUD_CONFIRMED: 2, WITHDRAWN: 2, SETTLED: 5 };

function addDays(iso, d) {
  const t = new Date(iso);
  t.setDate(t.getDate() + d);
  return t.toISOString();
}

function WhatNext({ claim }) {
  const g = claim.context?.garage;
  const s = claim.status;
  const step = STEP_OF[s] ?? 1;
  const closed = ["DECLINED", "FRAUD_CONFIRMED", "WITHDRAWN"].includes(s);
  const cashless = claim.settlement?.mode === "cashless";
  const expected = [
    ["We review it", formatDate(addDays(claim.created_at, 1))], ["Decision", formatDate(addDays(claim.created_at, 2))],
    [cashless ? "Repair at the garage" : "Payment to your bank", formatDate(addDays(claim.created_at, 2 + (g?.avg_tat_days ?? 5)))],
  ];
  return (
    <div className="flex flex-col gap-6">
      <Card compact title="Where your claim is">
        <Stepper steps={STEPS} current={step} errorAt={closed ? 2 : undefined} />
        <p className="mt-4 text-sm text-text">
          {s === "INFO_REQUESTED" ? "We need a little more information from you — use “Respond to information request” above."
            : closed ? "This claim was not approved. You can message us if you'd like to discuss it."
            : s === "SETTLED" ? `Your claim is settled${claim.settlement?.paid_amount ? ` — ${formatINR(claim.settlement.paid_amount)} paid (ref ${claim.settlement.payment_reference})` : ""}.`
            : ["APPROVED", "PREAUTH_ISSUED"].includes(s) ? "Your claim is approved." : "Our team is reviewing your photos and documents."}
        </p>
      </Card>
      {!closed && s !== "SETTLED" && (
        <Card compact title="Expected dates" subtitle="Estimates — we'll message you at every step">
          <ul className="flex flex-col gap-2 text-sm">{expected.map(([k, v]) => <li key={k} className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className="text-text">{v}</span></li>)}</ul>
        </Card>
      )}
      {g && (
        <Card compact title="Your garage">
          <p className="font-semibold text-text">{g.name}</p>
          <p className="text-sm text-muted">{g.city} · {g.contact}</p>
          <p className="mt-3 text-sm text-text">
            {cashless ? "Cashless repair: once approved, ABC pays the garage directly. You pay only the deductible and anything not covered, when you collect the car."
              : "Reimbursement: pay the garage, then upload the final invoice and payment receipt here. We transfer the approved amount to your bank account."}
          </p>
        </Card>
      )}
    </div>
  );
}

function NeedsList({ claim }) {
  const items = (claim.document_checklist ?? []).filter((c) => c.group !== "optional");
  if (!items.length) return null;
  return (
    <Card compact title="Documents for this claim">
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((c) => {
          const st = DOC_STATUS[c.status];
          return <li key={c.doc} className="flex items-center justify-between gap-2 text-sm"><span className="text-text">{c.label}</span><StatusFlag size="sm" level={st.level} label={st.label} /></li>;
        })}
      </ul>
    </Card>
  );
}

export function RespondModal({ claim, onClose }) {
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState("");
  const respond = useRespondToRequest(claim.id);
  const items = claim.decision?.info_request?.items ?? [];
  const add = (list) => setFiles((f) => [...f, ...Array.from(list).map((file) => ({ file, kind: file.type.startsWith("image/") ? "photo" : "document" }))]);
  const canSend = files.length > 0 || message.trim().length > 0;
  return (
    <Modal open onClose={onClose} title="Respond to the information request" description="Upload what we asked for and add a note if you like."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button icon={MessageSquareReply} loading={respond.isPending} disabledReason={canSend ? undefined : "Add a file or a message"}
          onClick={() => respond.mutate({ files: files.map((f) => ({ file: f.file, kind: f.kind, type: f.file.type, slot: f.kind === "photo" ? "closeup" : "other" })), message: message.trim() }, { onSuccess: onClose })}>
          Send response</Button></>}>
      <div className="flex flex-col gap-4">
        {items.length > 0 && (
          <div><p className="text-sm font-medium text-text">We asked for</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-text">{items.map((i) => <li key={i}>{i}</li>)}</ul></div>
        )}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted hover:border-primary">
          <FileUp size={24} aria-hidden="true" />
          <span><span className="font-medium text-text">Choose files</span> — photos (JPG, PNG) or PDF, up to 25 MB each</span>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </label>
        {files.length > 0 && (
          <ul className="flex flex-col gap-2">
            {files.map((f, i) => (
              <li key={`${f.file.name}-${i}`} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                <Paperclip size={16} className="shrink-0 text-subtle" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm text-text">{f.file.name} <span className="text-caption text-subtle">· {formatBytes(f.file.size)}</span></span>
                {f.file.type.startsWith("image/") && (
                  <Select size="sm" className="w-48" aria-label={`What is ${f.file.name}?`} value={f.kind}
                    onChange={(v) => setFiles((all) => all.map((x, j) => (j === i ? { ...x, kind: v } : x)))}
                    options={[{ value: "photo", label: "Photo of the vehicle" }, { value: "document", label: "Document" }]} />
                )}
                <Button size="sm" variant="ghost" icon={X} aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        )}
        <Field label="Message (optional)">{(p) => <Textarea {...p} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

/** Customer view of a claim (§10.4 E): plain language, no internal data (the server strips it), two actions. */
export function CustomerClaimView({ claim }) {
  const back = useBackToClaims();
  const [respond, setRespond] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <ClaimHeader claim={claim} admin={false} onBack={back} />
      <div className="no-print flex flex-wrap items-center gap-2">
        {claim.status === "INFO_REQUESTED" && <Button icon={MessageSquareReply} onClick={() => setRespond(true)}>Respond to information request</Button>}
      </div>
      <Tabs tabs={CUSTOMER_TABS} urlParam="tab">
        {(value) => (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={value} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {value === "overview" && <OverviewTab claim={claim} admin={false} />}
              {value === "status" && <TimelineTab claim={claim} grouped={false} />}
              {value === "files" && <div className="flex flex-col gap-6"><NeedsList claim={claim} /><MediaTab claim={claim} internal={false} /></div>}
              {value === "messages" && <CommsTab claim={claim} viewer="customer" />}
              {value === "next" && <WhatNext claim={claim} />}
            </motion.div>
          </AnimatePresence>
        )}
      </Tabs>
      {respond && <RespondModal claim={claim} onClose={() => setRespond(false)} />}
    </div>
  );
}
