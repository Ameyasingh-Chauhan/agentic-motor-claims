import { CircleCheck, TriangleAlert, CircleX, CircleDashed } from "lucide-react";
import { cn } from "../../lib/cn";

/** Flag levels (§6.5) — colour always paired with an icon AND a text label (CLAUDE.md rule 7). */
export const FLAG_LEVELS = {
  pass: { icon: CircleCheck, cls: "bg-success-bg text-success", defaultLabel: "Verified" },
  warn: { icon: TriangleAlert, cls: "bg-warning-bg text-warning", defaultLabel: "Needs attention" },
  fail: { icon: CircleX, cls: "bg-danger-bg text-danger", defaultLabel: "Mismatch" },
  pending: { icon: CircleDashed, cls: "bg-neutral-bg text-muted", defaultLabel: "Pending" },
};

export function StatusFlag({ level = "pending", label, size = "md", className, title }) {
  const cfg = FLAG_LEVELS[level] ?? FLAG_LEVELS.pending;
  const Icon = cfg.icon;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm font-medium whitespace-nowrap",
        size === "sm" ? "h-6 px-2 text-caption" : "h-7 px-2 text-sm",
        cfg.cls,
        className,
      )}
    >
      <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" className="shrink-0" />
      {label ?? cfg.defaultLabel}
    </span>
  );
}

/** Claim status keys → label + style (§6.5). */
export const CLAIM_STATUSES = {
  DRAFT: { label: "Draft", style: "grey" },
  SUBMITTED: { label: "Submitted", style: "blue" },
  PROCESSING: { label: "AI processing", style: "blue", dot: true },
  INFO_REQUESTED: { label: "Info requested", style: "amber" },
  UNDER_REVIEW: { label: "Under review", style: "amber" },
  SIU_INVESTIGATION: { label: "SIU investigation", style: "red" },
  APPROVED: { label: "Approved", style: "green" },
  PREAUTH_ISSUED: { label: "Pre-auth issued", style: "green" },
  SETTLED: { label: "Settled", style: "green-solid" },
  DECLINED: { label: "Declined", style: "red-outline" },
  FRAUD_CONFIRMED: { label: "Fraud confirmed", style: "red-solid" },
  WITHDRAWN: { label: "Withdrawn", style: "grey" },
};

/** Customer-facing labels (customer role only) — never mention fraud or investigations. */
export const CUSTOMER_STATUS_LABELS = {
  PROCESSING: "We're reviewing your claim",
  UNDER_REVIEW: "Additional verification in progress",
  SIU_INVESTIGATION: "Additional verification in progress",
  INFO_REQUESTED: "We need a little more information",
  FRAUD_CONFIRMED: "Claim not approved",
  DECLINED: "Claim not approved",
};

const STYLE_CLS = {
  grey: "bg-neutral-bg text-muted border-transparent",
  blue: "bg-transparent text-blue-600 border-blue-600",
  amber: "bg-warning-bg text-warning border-transparent",
  red: "bg-danger-bg text-danger border-transparent",
  green: "bg-success-bg text-success border-transparent",
  "green-solid": "bg-success text-on-status border-transparent",
  "red-outline": "bg-transparent text-danger border-danger",
  "red-solid": "bg-danger text-on-status border-transparent",
};

const STYLE_ICON = {
  grey: CircleDashed,
  blue: null,
  amber: TriangleAlert,
  red: TriangleAlert,
  green: CircleCheck,
  "green-solid": CircleCheck,
  "red-outline": CircleX,
  "red-solid": CircleX,
};

/**
 * One badge for claim status everywhere. `audience="customer"` swaps in the customer-safe label,
 * and maps internal-only states to a neutral amber style.
 */
export function ClaimStatusBadge({ status, audience = "handler", className }) {
  const cfg = CLAIM_STATUSES[status] ?? { label: status, style: "grey" };
  let style = cfg.style;
  let label = cfg.label;
  if (audience === "customer" && CUSTOMER_STATUS_LABELS[status]) {
    label = CUSTOMER_STATUS_LABELS[status];
    if (status === "SIU_INVESTIGATION") style = "amber";
    if (status === "FRAUD_CONFIRMED") style = "red-outline";
  }
  const Icon = STYLE_ICON[style];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-caption whitespace-nowrap",
        STYLE_CLS[style],
        className,
      )}
    >
      {cfg.dot ? (
        <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={14} aria-hidden="true" className="shrink-0" />
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
