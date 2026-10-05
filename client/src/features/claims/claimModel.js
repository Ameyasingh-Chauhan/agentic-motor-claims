/** Claim Detail model: action metadata, optimistic status, flags, labels. Pure functions — no React. */
import {
  BadgeCheck, CircleDollarSign, FileQuestion, FileText, Gavel, HandCoins, MessageSquareText, ShieldAlert, ShieldCheck, ShieldX,
  StickyNote, UserRoundCog, XCircle,
} from "lucide-react";
import { formatINR } from "../../lib/format";

export const FINAL_STATUSES = new Set(["SETTLED", "WITHDRAWN", "FRAUD_CONFIRMED"]);

/**
 * Handler actions (server matrix: services/claim_actions.py). `presets` are the one-tap reasons in the confirm modal; `preview`
 * describes the effect before confirming (spec §10.4 A).
 */
export const ACTION_META = {
  approve: {
    label: "Approve", icon: BadgeCheck, variant: "primary", done: "Claim approved",
    presets: ["Damage consistent with the incident", "All checks passed", "Within authority limit"],
    preview: (c) => `${previewStatus(c, "approve")} for ${formatINR(c.financials?.net_payable)}; the customer is notified on ${channelName(c)}.`,
  },
  approve_revised: {
    label: "Approve revised amount", icon: HandCoins, variant: "secondary", done: "Approved at the revised amount",
    presets: ["Garage quote above AI estimate — approve at assessed amount", "Revised after surveyor inspection", "Negotiated with the garage"],
    fields: ["amount"],
    preview: (c, f) => `${previewStatus(c, "approve_revised")} for ${f.amount ? formatINR(f.amount) : "the amount you enter"}; the customer is notified on ${channelName(c)}.`,
  },
  request_info: {
    label: "Request info", icon: FileQuestion, variant: "secondary", done: "Information requested",
    presets: ["Documents incomplete", "Photo coverage insufficient", "Need clarification on the incident"],
    fields: ["items"],
    preview: (c) => `Status will change to Info requested; the customer gets the list on ${channelName(c)} and can upload in the app.`,
  },
  escalate_siu: {
    label: "Escalate to SIU", icon: ShieldAlert, variant: "secondary", done: "Referred to SIU",
    presets: ["Location contradiction needs investigation", "Pre-existing damage suspected", "Linked to other suspicious claims"],
    preview: () => "Status will change to SIU investigation. The customer is not notified (they continue to see “Under review”).",
  },
  reject: {
    label: "Reject", icon: XCircle, variant: "danger", done: "Claim declined",
    presets: ["Not covered under the policy", "Policy lapsed on the incident date", "Damage not caused by the reported incident"],
    preview: (c) => `Status will change to Declined; the customer receives a neutral “not approved” message on ${channelName(c)}.`,
  },
  settle: {
    label: "Mark as settled", icon: CircleDollarSign, variant: "primary", done: "Claim settled",
    presets: ["Payment released to the garage", "Reimbursed to the customer's bank account", "Settled after final invoice"],
    fields: ["amount", "date", "payment_reference"],
    preview: (c) => `Status will change to Settled (final). The payment details are recorded and the customer is notified on ${channelName(c)}.`,
  },
  confirm_fraud: {
    label: "Confirm fraud", icon: ShieldX, variant: "danger", done: "Fraud confirmed",
    presets: ["SIU investigation confirmed misrepresentation", "Staged incident confirmed", "Pre-existing damage claimed as new"],
    preview: () => "Status will change to Fraud confirmed (final). The customer sees only “Claim not approved” with a neutral reason.",
  },
  clear_siu: {
    label: "Clear SIU review", icon: ShieldCheck, variant: "secondary", done: "SIU review cleared",
    presets: ["Investigation found no misrepresentation", "Explanation and evidence verified", "Location contradiction resolved"],
    preview: () => "Status will change to Under review so a handler can decide. The customer is not notified.",
  },
  reassign: {
    label: "Reassign", icon: UserRoundCog, variant: "secondary", done: "Claim reassigned",
    presets: ["Workload balancing", "Specialist review needed", "Handler on leave"], fields: ["assignee"],
    preview: (c, f, people) => `The claim will be assigned to ${people?.[f.assignee] ?? "the chosen handler"}, who is notified.`,
  },
  note: { label: "Add internal note", icon: StickyNote, variant: "secondary", done: "Note added", fields: ["text"], presets: [],
    preview: () => "Internal notes are visible to claims staff only." },
};

export const PRIMARY_ACTIONS = ["approve", "approve_revised", "request_info", "escalate_siu", "reject"];
export const MENU_ACTIONS = ["settle", "confirm_fraud", "clear_siu", "reassign", "note"];
export const INFO_ITEMS = ["Repair estimate", "Close-up photo of the damaged area", "Driving licence", "RC copy", "FIR copy",
  "Original keys (all sets)", "Repair invoice", "Cancelled cheque"];

const channelName = (c) => (c.channel === "whatsapp" ? "WhatsApp" : "SMS");

export function optimisticStatus(claim, action) {
  if (["approve", "approve_revised"].includes(action)) return claim.settlement?.mode === "cashless" ? "PREAUTH_ISSUED" : "APPROVED";
  return { request_info: "INFO_REQUESTED", escalate_siu: "SIU_INVESTIGATION", reject: "DECLINED", settle: "SETTLED",
    confirm_fraud: "FRAUD_CONFIRMED", clear_siu: "UNDER_REVIEW" }[action] ?? null;
}

function previewStatus(c, action) {
  return optimisticStatus(c, action) === "PREAUTH_ISSUED" ? "Status will change to Pre-auth issued" : "Status will change to Approved";
}

export const CHECK_LABELS = {
  policy: "Policy core", vahan: "Vahan RC", dl: "Driving licence", fastag: "FASTag", iib: "IIB claim history", police: "Police / NCRB",
  kyc: "KYC", vehicle_identity: "Vehicle identity",
};
export const CHECK_ORDER = ["policy", "vahan", "dl", "fastag", "iib", "police", "kyc", "vehicle_identity"];

export const DOC_STATUS = {
  verified: { level: "pass", label: "Received & verified" },
  mismatch: { level: "fail", label: "Received – mismatch" },
  unclear: { level: "warn", label: "Unclear" },
  received: { level: "pending", label: "Received – awaiting check" },
  missing: { level: "pending", label: "Missing" },
};

export const AGENT_LABEL = {
  intake: "Intake agent", document: "Document agent", verification: "Verification agent", damage: "Damage agent",
  fraud: "Fraud agent", adjudication: "Adjudication agent", communication: "Communication agent",
};

/** Who did it: agent (blue icon), human (avatar), customer, or system. */
export function actorOf(actor, claim, people = {}) {
  if (!actor) return { kind: "system", label: "System" };
  if (actor.startsWith("agent:")) return { kind: "agent", key: actor.slice(6), label: AGENT_LABEL[actor.slice(6)] ?? "AI agent" };
  if (actor === "customer") return { kind: "customer", label: claim?.customer_name ?? "Customer" };
  if (actor === "abc") return { kind: "system", label: "ABC General Insurance" };
  if (actor === "system") return { kind: "system", label: "System" };
  return { kind: "human", label: people[actor] ?? "Claims handler" };
}

/**
 * Flags strip / rail: every finding with its level, a short label and where its evidence lives (tab + element id).
 * Red first, then amber; green is one summary count of everything that passed.
 */
export function buildFlags(claim) {
  const flags = [];
  for (const f of claim.fraud?.fired ?? []) {
    flags.push({ level: f.level === "fail" ? "fail" : "warn", label: f.name, tab: "fraud", target: `rule-${f.rule_id}`, group: "Fraud rules" });
  }
  let passed = 0;
  for (const key of CHECK_ORDER) {
    const ch = claim.checks?.[key];
    if (!ch) continue;
    if (ch.level === "pass") passed += 1;
    else if (ch.level === "fail" || ch.level === "warn") {
      flags.push({ level: ch.level, label: `${CHECK_LABELS[key]}: ${ch.summary}`, tab: "verification", target: `check-${key}`, group: "Verification" });
    }
  }
  for (const item of claim.damage?.items ?? []) {
    if (!item.fresh) flags.push({ level: "fail", label: `Pre-existing damage · ${item.part}`, tab: "damage", target: `damage-${item.part_code}`, group: "Damage" });
    else if (item.flag === "warn") flags.push({ level: "warn", label: `Low confidence · ${item.part}`, tab: "damage", target: `damage-${item.part_code}`, group: "Damage" });
  }
  const fin = claim.financials;
  if (fin?.variance_level === "fail" || fin?.variance_level === "warn") {
    flags.push({ level: fin.variance_level, label: `Garage quote ${Math.round(fin.variance_pct)}% above AI estimate`, tab: "financials", target: "variance", group: "Financials" });
  }
  if (fin?.total_loss_check?.is_total_loss) flags.push({ level: "warn", label: "Total loss (above 75% of IDV)", tab: "financials", target: "total-loss", group: "Financials" });
  for (const d of claim.document_checklist ?? []) {
    if (d.status === "mismatch") flags.push({ level: "fail", label: `${d.label}: mismatch`, tab: "documents", target: `doc-${d.doc}`, group: "Documents" });
    else if (d.status === "unclear") flags.push({ level: "warn", label: `${d.label}: unclear`, tab: "documents", target: `doc-${d.doc}`, group: "Documents" });
    else if (d.status === "missing" && d.group !== "optional") flags.push({ level: "warn", label: `${d.label}: missing`, tab: "documents", target: `doc-${d.doc}`, group: "Documents" });
    else if (d.status === "verified") passed += 1;
  }
  const narrative = claim.damage?.narrative_consistency;
  if (narrative && narrative.consistent === false && !(claim.fraud?.fired ?? []).some((f) => f.rule_id === "FR-03")) {
    flags.push({ level: "warn", label: "Narrative inconsistent with damage", tab: "damage", target: "narrative", group: "Damage" });
  }
  if (claim.policy_source === "uploaded_document") {
    flags.push({ level: "info", label: "Policy verified from uploaded document", tab: "overview", target: "policy-card", group: "Policy" });
  }
  const rank = { fail: 0, warn: 1, info: 2 };
  flags.sort((a, b) => rank[a.level] - rank[b.level]);
  return { flags, passed };
}

/** Tab ids in display order (spec §10.4 C). */
export const ADMIN_TABS = [
  { value: "overview", label: "Overview" }, { value: "timeline", label: "Timeline" }, { value: "damage", label: "Damage" },
  { value: "verification", label: "Verification" }, { value: "fraud", label: "Fraud analysis" }, { value: "financials", label: "Financials" },
  { value: "documents", label: "Documents" }, { value: "media", label: "Media & uploads" }, { value: "communications", label: "Communications" },
  { value: "audit", label: "Audit log" },
];
export const CUSTOMER_TABS = [
  { value: "overview", label: "Overview" }, { value: "status", label: "Status timeline" }, { value: "files", label: "Photos & documents" },
  { value: "messages", label: "Messages" }, { value: "next", label: "What happens next" },
];

export const TAB_ICONS = { documents: FileText, communications: MessageSquareText, audit: Gavel };
