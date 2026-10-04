import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, ChevronDown, Globe, Hourglass, Link2, MessageCircle, MoreHorizontal, Printer, Smartphone, Sparkles,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { ClaimStatusBadge } from "../../components/ui/StatusFlag";
import { RiskGauge } from "../../components/ui/RiskGauge";
import { RiskChip } from "../../components/ui/RiskChip";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { DropdownMenu } from "../../components/ui/Popover";
import { formatDateTime } from "../../lib/format";
import { DUR, EASE } from "../../lib/motion";
import { ACTION_META, FINAL_STATUSES, MENU_ACTIONS, PRIMARY_ACTIONS } from "./claimModel";

const CHANNEL = {
  whatsapp: { icon: MessageCircle, label: "WhatsApp" }, app: { icon: Smartphone, label: "App" },
  web: { icon: Globe, label: "Web" }, branch: { icon: Building2, label: "Branch" },
};
const COMPACT_AT = 120;
import { HOME_RETURN_KEY } from "../../lib/homeReturn";

/** "← All claims": back to Home exactly as it was left (URL + scroll, saved by HomePage in sessionStorage). */
export function useBackToClaims() {
  const navigate = useNavigate();
  return () => {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(HOME_RETURN_KEY) || "null"); } catch { /* storage unavailable */ }
    try { if (saved) sessionStorage.setItem(HOME_RETURN_KEY, JSON.stringify({ ...saved, restore: true })); } catch { /* ignore */ }
    navigate(`/${saved?.search ?? ""}`);
  };
}

/** Which actions show as buttons: the five standard ones plus those the current status makes relevant. */
function barActions(claim) {
  const ctx = claim.status === "SIU_INVESTIGATION" ? ["confirm_fraud", "clear_siu"]
    : ["APPROVED", "PREAUTH_ISSUED"].includes(claim.status) ? ["settle"] : [];
  return [...PRIMARY_ACTIONS, ...ctx];
}

function recommendedKey(claim) {
  const r = claim.decision?.recommended_action;
  if (claim.status === "SIU_INVESTIGATION") return null;
  return r === "approve_total_loss" ? "approve" : r;
}

function ActionButtons({ claim, onAction, size = "md" }) {
  const allowed = claim.allowed_actions ?? {};
  const rec = recommendedKey(claim);
  const keys = barActions(claim);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {keys.map((k) => {
        const meta = ACTION_META[k];
        const a = allowed[k] ?? { allowed: false, reason: "Not available" };
        const primary = k === rec || (k === "settle" && a.allowed);
        const variant = primary ? "primary" : "secondary"; // red is reserved for the confirm step inside the modal
        return (
          <Button key={k} size={size} variant={variant} icon={meta.icon} onClick={() => onAction(k)}
            disabledReason={claim._pending ? "Saving the previous action…" : a.allowed ? undefined : a.reason}>
            {meta.label}
          </Button>
        );
      })}
      <MoreMenu claim={claim} onAction={onAction} exclude={keys} size={size} />
    </div>
  );
}

function MoreMenu({ claim, onAction, exclude, size }) {
  const allowed = claim.allowed_actions ?? {};
  const items = MENU_ACTIONS.filter((k) => !exclude.includes(k)).map((k) => ({
    label: allowed[k]?.allowed ? ACTION_META[k].label : `${ACTION_META[k].label} — ${allowed[k]?.reason ?? "not available"}`,
    icon: ACTION_META[k].icon, disabled: !allowed[k]?.allowed, onSelect: () => onAction(k),
  }));
  items.push({ type: "separator" },
    { label: "Download claim summary (PDF)", icon: Printer, onSelect: () => window.print() },
    { label: "Copy link", icon: Link2, onSelect: () => navigator.clipboard?.writeText(window.location.href).then(() => toast.success("Link copied")) });
  return (
    <DropdownMenu
      trigger={<Button size={size} variant="ghost" icon={MoreHorizontal} aria-label="More actions">More</Button>}
      items={items}
    />
  );
}

function CompactActions({ claim, onAction }) {
  const allowed = claim.allowed_actions ?? {};
  const keys = [...barActions(claim), ...MENU_ACTIONS.filter((k) => !barActions(claim).includes(k))];
  const items = keys.map((k) => ({
    label: allowed[k]?.allowed ? ACTION_META[k].label : `${ACTION_META[k].label} — ${allowed[k]?.reason ?? "not available"}`,
    icon: ACTION_META[k].icon, disabled: !allowed[k]?.allowed || !!claim._pending, onSelect: () => onAction(k),
  }));
  return <DropdownMenu trigger={<Button size="sm" variant="secondary" icon={ChevronDown}>Actions</Button>} items={items} />;
}

/**
 * Sticky claim header (§10.4 A). The full header scrolls away; past 120 px a 72 px compact bar slides in under the topbar
 * (transform + opacity only). Entrance is a 200 ms fade (the Home row → header shared-element transition is not used: the app's
 * route transition unmounts Home before the lazy detail route mounts — see PROGRESS decision).
 */
export function ClaimHeader({ claim, admin, onAction, onBack }) {
  const { scrollY } = useScroll();
  const [compact, setCompact] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setCompact(y > COMPACT_AT));
  const ch = CHANNEL[claim.channel] ?? CHANNEL.app;
  const audience = admin ? "handler" : "customer";
  const pending = admin && claim.risk_score == null;

  return (
    <>
      <div className="no-print sticky top-16 z-30 h-0" aria-hidden={!compact}>
        <AnimatePresence>
          {compact && (
            <motion.div
              initial={{ y: "-100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ duration: DUR.toggle, ease: EASE }}
              className="absolute inset-x-0 top-0 flex h-18 items-center gap-4 rounded-b-lg border border-t-0 border-border bg-surface px-4 shadow-md"
            >
              <span className="mono font-semibold text-text">{claim.id}</span>
              <ClaimStatusBadge status={claim.status} audience={audience} />
              <span className="hidden min-w-0 truncate text-sm text-muted lg:inline">
                {claim.customer_name} · {claim.vehicle.make} {claim.vehicle.model} · <span className="mono">{claim.registration}</span>
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-3">
                {admin && claim.risk_score != null && <RiskChip score={claim.risk_score} />}
                {admin && <CompactActions claim={claim} onAction={onAction} />}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="rounded-xl border border-border bg-surface p-6 shadow-sm"
      >
        <button type="button" onClick={onBack} className="no-print inline-flex items-center gap-1 text-sm text-muted transition-colors duration-150 hover:text-text">
          <ArrowLeft size={16} aria-hidden="true" /> All claims
        </button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="mono text-2xl font-semibold text-text">{claim.id}</h1>
              <CopyButton value={claim.id} label="Copy claim ID" className="no-print" />
              <ClaimStatusBadge status={claim.status} audience={audience} />
              {claim.origin === "app" && <Badge tone="blue" icon={Smartphone}>Filed in app</Badge>}
              {FINAL_STATUSES.has(claim.status) && admin && <Badge tone="outline">Final status</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-2 text-text"><Avatar name={claim.customer_name} size="sm" />{claim.customer_name}</span>
              <span>{claim.vehicle.make} {claim.vehicle.model} · <span className="mono text-text">{claim.registration}</span></span>
              <span>Reported {formatDateTime(claim.incident?.reported_at ?? claim.created_at)}</span>
              <span className="inline-flex items-center gap-1"><ch.icon size={16} aria-hidden="true" />{ch.label}</span>
            </div>
          </div>
          {admin && (pending ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-tint-blue-bg px-3 py-2 text-sm text-text">
              <Hourglass size={16} className="text-tint-blue" aria-hidden="true" /> AI assessment pending
            </span>
          ) : (
            <RiskGauge score={claim.risk_score} size="sm" />
          ))}
        </div>
        {admin ? (
          <div className="no-print mt-5 border-t border-border pt-4">
            <ActionButtons claim={claim} onAction={onAction} />
            {recommendedKey(claim) && claim.allowed_actions?.[recommendedKey(claim)]?.allowed && (
              <p className="mt-2 inline-flex items-center gap-1 text-caption text-muted">
                <Sparkles size={14} className="text-tint-blue" aria-hidden="true" />
                Highlighted: the AI's recommendation ({Math.round((claim.decision?.confidence ?? 0) * 100)}% confidence). You can choose any action.
              </p>
            )}
          </div>
        ) : null}
      </motion.header>
    </>
  );
}

