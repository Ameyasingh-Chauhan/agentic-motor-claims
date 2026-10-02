import {
  AppWindow, BadgeCheck, Bike, Bot, Car, CarFront, ClipboardList, Construction, FileScan, Gavel, Hourglass, IndianRupee,
  KeyRound, MessageSquareText, MoveHorizontal, PawPrint, PiggyBank, ScanSearch, ShieldAlert, ShieldCheck, SquareParking,
  Timer, Waves, Workflow, Zap, CalendarClock, Inbox,
} from "lucide-react";
import { CLAIM_STATUSES, CUSTOMER_STATUS_LABELS } from "../../components/ui/StatusFlag";

/** Chip order (§10.3 D). Customers see only their (server-mapped) statuses, with customer-safe labels. */
export const ADMIN_CHIPS = ["PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION", "APPROVED", "PREAUTH_ISSUED", "SETTLED", "DECLINED", "FRAUD_CONFIRMED", "WITHDRAWN"];
export const CUSTOMER_CHIPS = ["PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "APPROVED", "PREAUTH_ISSUED", "SETTLED", "DECLINED", "WITHDRAWN"];

/** Status dot colour per §6.5 badge style. */
export const STATUS_DOT = {
  grey: "bg-neutral", blue: "bg-blue-600", amber: "bg-warning", red: "bg-danger", green: "bg-success",
  "green-solid": "bg-success", "red-outline": "bg-danger", "red-solid": "bg-danger",
};

export function statusLabel(status, customer) {
  if (customer && CUSTOMER_STATUS_LABELS[status]) return CUSTOMER_STATUS_LABELS[status];
  return CLAIM_STATUSES[status]?.label ?? status;
}

export function statusDot(status) {
  return STATUS_DOT[CLAIM_STATUSES[status]?.style] ?? "bg-neutral";
}

/** KPI presentation (values, deltas, series and links come from /api/stats/home). */
export const KPI_META = {
  total_claims: { icon: ClipboardList, tone: "blue" },
  settled_approved: { icon: BadgeCheck, tone: "green" },
  amount_approved: { icon: IndianRupee, tone: "navy" },
  fraud_detected: { icon: ShieldAlert, tone: "red" },
  fraud_savings: { icon: PiggyBank, tone: "orange" },
  avg_turnaround: { icon: Timer, tone: "amber" },
  stp_rate: { icon: Zap, tone: "blue" },
  pending_action: { icon: Hourglass, tone: "orange" },
  my_claims: { icon: ClipboardList, tone: "blue" },
  approved_amount: { icon: IndianRupee, tone: "green" },
  in_progress: { icon: Hourglass, tone: "orange" },
  last_update: { icon: CalendarClock, tone: "navy" },
};

/** Labels for server-defined segments (shown as a removable filter pill). */
export const SEGMENT_LABELS = {
  paid: "Settled / approved", fraud_detected: "Fraud detected", fraud_savings: "Fraud savings", decided: "Decided claims",
  auto_decided: "Straight-through (auto-decided)", pending_action: "Pending action", open: "In progress",
  bucket_in_progress: "In progress", bucket_needs_action: "Needs action", bucket_siu: "SIU investigation",
  bucket_paid: "Approved & settled", bucket_closed: "Declined & closed",
  bucket_c_in_progress: "In progress", bucket_c_needs_input: "Needs your input", bucket_c_paid: "Approved & paid", bucket_c_closed: "Closed",
};

export const INCIDENT_ICONS = {
  rear_end: CarFront, front_collision: Car, side_swipe: MoveHorizontal, parking_scrape: SquareParking, skid_fall: Bike,
  pothole: Construction, glass: AppWindow, flood: Waves, animal: PawPrint, theft: KeyRound,
};

/** The seven agents (§15) — hero pipeline and activity feed. */
export const AGENTS = [
  { key: "intake", label: "Intake", icon: MessageSquareText },
  { key: "document", label: "Document", icon: FileScan },
  { key: "verification", label: "Verification", icon: ShieldCheck },
  { key: "damage", label: "Damage", icon: ScanSearch },
  { key: "fraud", label: "Fraud", customerLabel: "Validation", icon: ShieldAlert },
  { key: "adjudication", label: "Adjudication", icon: Gavel },
  { key: "communication", label: "Communication", icon: Inbox },
];
export const AGENT_ICON = Object.fromEntries(AGENTS.map((a) => [a.key, a.icon]));
export const ACTOR_ICONS = { agent: Bot, human: Workflow };

export const VEHICLE_TYPES = [{ value: "Car", label: "Car" }, { value: "2W", label: "Two-wheeler" }, { value: "CV", label: "Commercial" }];
export const CLAIM_TYPES = ["OD", "TP", "Theft", "Glass", "Total loss"].map((v) => ({
  value: v, label: { OD: "Own damage", TP: "Third party" }[v] ?? v,
}));
export const RISK_BANDS = [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }];
