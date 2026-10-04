"""Handler actions on a claim (spec §10.4 A, Phase 3B brief + addition): status-validity matrix, effects, undo.

Every action is validated against MATRIX for the claim's current status (invalid → 409 with the reason the UI shows as a tooltip),
then applied: status/decision/amount fields, a timeline event, an immutable audit entry, customer-safe customer message +
notification where the customer is affected, and notifications for the other admins. Admins may override the AI recommendation at
any non-final status; SETTLED, WITHDRAWN and FRAUD_CONFIRMED are final. Every action except the undo itself is reversible within
UNDO_SECONDS (snapshot kept in memory for that window; the audit trail records both the action and its undo).
"""
from __future__ import annotations

import copy
import secrets
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Callable

from .claim_views import now_ist

UNDO_SECONDS = 6
UNDO_GRACE = 4                     # network/render slack on top of the 6 s the toast shows
FINAL = {"SETTLED", "WITHDRAWN", "FRAUD_CONFIRMED"}
OPEN = {"SUBMITTED", "PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION"}
APPROVED_STATES = {"APPROVED", "PREAUTH_ISSUED"}
STATUS_TEXT = {"SETTLED": "settled", "WITHDRAWN": "withdrawn", "FRAUD_CONFIRMED": "closed as fraud confirmed", "DECLINED": "declined",
               "APPROVED": "approved", "PREAUTH_ISSUED": "pre-authorised", "SIU_INVESTIGATION": "with SIU",
               "INFO_REQUESTED": "waiting for the customer", "DRAFT": "a draft"}


@dataclass
class Action:
    key: str
    label: str
    allowed_from: set[str]
    to: str | None                       # None = no status change (reassign, note)
    why_not: Callable[[dict], str | None] = lambda c: None   # extra precondition → reason it is unavailable
    status_reason: dict[str, str] = field(default_factory=dict)


def _needs_estimate(c: dict) -> str | None:
    return None if (c.get("financials") or {}).get("net_payable") is not None else "AI estimate not available yet — use Approve revised amount"


MATRIX: dict[str, Action] = {a.key: a for a in [
    Action("approve", "Approve", OPEN | {"DECLINED"}, "APPROVED", _needs_estimate,
           {"APPROVED": "Already approved — use Approve revised amount to change the amount",
            "PREAUTH_ISSUED": "Pre-auth already issued — use Approve revised amount to change the amount"}),
    Action("approve_revised", "Approve revised amount", OPEN | {"DECLINED"} | APPROVED_STATES, "APPROVED"),
    Action("request_info", "Request info", OPEN - {"INFO_REQUESTED"}, "INFO_REQUESTED",
           status_reason={"INFO_REQUESTED": "Already waiting for the customer's reply",
                          "APPROVED": "Already approved", "PREAUTH_ISSUED": "Pre-auth already issued", "DECLINED": "Claim is declined"}),
    Action("escalate_siu", "Escalate to SIU", (OPEN - {"SIU_INVESTIGATION"}) | APPROVED_STATES | {"DECLINED"}, "SIU_INVESTIGATION",
           status_reason={"SIU_INVESTIGATION": "Already with SIU"}),
    Action("reject", "Reject", OPEN | APPROVED_STATES, "DECLINED", status_reason={"DECLINED": "Already declined"}),
    Action("settle", "Mark as settled", APPROVED_STATES, "SETTLED",
           status_reason={s: "Only approved or pre-authorised claims can be settled" for s in OPEN | {"DECLINED"}}),
    Action("confirm_fraud", "Confirm fraud", {"SIU_INVESTIGATION"}, "FRAUD_CONFIRMED"),
    Action("clear_siu", "Clear SIU review", {"SIU_INVESTIGATION"}, "UNDER_REVIEW"),
    Action("reassign", "Reassign", OPEN | APPROVED_STATES | {"DECLINED"}, None),
    Action("note", "Add internal note", OPEN | APPROVED_STATES | {"DECLINED"} | FINAL, None),
]}
for _a in ("confirm_fraud", "clear_siu"):
    MATRIX[_a].status_reason = {s: "Only for claims under SIU investigation" for s in OPEN | APPROVED_STATES | {"DECLINED"} if s != "SIU_INVESTIGATION"}


def unavailable(action: str, c: dict) -> str | None:
    """Why `action` cannot run on claim `c` right now (None = allowed)."""
    a = MATRIX[action]
    s = c["status"]
    if s == "DRAFT":
        return "The claim has not been submitted yet"
    if s not in a.allowed_from:
        if s in FINAL:
            return f"Claim is {STATUS_TEXT[s]} — this is a final status"
        return a.status_reason.get(s) or f"Not available while the claim is {STATUS_TEXT.get(s, s.replace('_', ' ').lower())}"
    return a.why_not(c)


def allowed_actions(c: dict) -> dict[str, dict]:
    return {k: {"label": a.label, "allowed": (r := unavailable(k, c)) is None, "reason": r} for k, a in MATRIX.items()}


# ------------------------------------------------------------------------------------------------ effects

class ActionError(ValueError):
    def __init__(self, status: int, code: str, message: str, fields: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.fields = status, code, message, fields or {}


@dataclass
class Effects:
    customer_message: str | None = None       # customer-safe text sent on the claim's channel
    customer_notice: str | None = None        # customer-safe notification title
    admin_notice: str | None = None


def inr(v: float) -> str:
    """₹ in Indian grouping (₹1,25,000), for messages and timeline text."""
    n = int(round(v))
    s = str(n)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        s = ",".join(([head] if head else []) + groups) + "," + tail
    return f"₹{s}"


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def _decision(c: dict) -> dict:
    """App-filed claims have no AI decision until Phase 5; a human decision still needs somewhere to live."""
    if not c.get("decision"):
        c["decision"] = {"route": "handler", "recommended_action": "manual_review", "auto": False, "confidence": 0.0, "reasons": [],
                         "final_action": None, "decided_by": None, "decided_at": None, "approved_amount": None, "info_request": None,
                         "ai_pending": True}
    return c["decision"]


def _require(cond: bool, field_name: str, message: str) -> None:
    if not cond:
        raise ActionError(422, "validation", message, {field_name: message})


def apply(c: dict, action: str, body: dict, user: dict, people: dict[str, str], now: datetime | None = None) -> tuple[dict, Effects]:
    """Mutate `c` for `action`. Returns (the audit entry, customer/admin effects). Raises ActionError."""
    now = now or now_ist()
    reason = (body.get("reason") or "").strip()
    if action not in MATRIX:
        raise ActionError(422, "unknown_action", f"Unknown action '{action}'")
    why = unavailable(action, c)
    if why:
        raise ActionError(409, "invalid_for_status", why)
    if action != "note":
        _require(len(reason) >= 5, "reason", "Give a reason (at least 5 characters)")
    a, before, who = MATRIX[action], c["status"], people.get(user["id"], "Claims handler")
    previous_assignee = c.get("assignee")
    d = c.get("decision") or {}
    recommended = d.get("recommended_action")
    eff = Effects()
    text = ""
    ttype = action

    if action in ("approve", "approve_revised"):
        if action == "approve":
            amount = float(c["financials"]["net_payable"])
        else:
            amount = body.get("amount")
            _require(isinstance(amount, (int, float)) and amount > 0, "amount", "Enter the approved amount")
            limit = (c.get("financials") or {}).get("total_loss_check", {}).get("idv") or 1e8
            _require(amount <= limit, "amount", f"Amount cannot exceed the IDV ({inr(limit)})")
            amount = float(amount)
        to = "PREAUTH_ISSUED" if (c.get("settlement") or {}).get("mode") == "cashless" else "APPROVED"
        dec = _decision(c)
        dec |= {"final_action": action, "decided_by": user["id"], "decided_at": _iso(now), "approved_amount": amount}
        c["amount_approved"] = amount
        ttype = "approved"
        quote = (c.get("financials") or {}).get("garage_quote") or c.get("garage_quote")
        text = f"Approved {inr(amount)}" + (f" (revised; garage quote {inr(quote)})" if action == "approve_revised" and quote else "") + f" by {who}"
        what = "Cashless pre-approval" if to == "PREAUTH_ISSUED" else "Approval"
        garage = f" at {c['garage_name']}" if to == "PREAUTH_ISSUED" and c.get("garage_name") else ""
        eff.customer_message = f"Good news! {what} of {inr(amount)} for claim {c['id']} has been issued{garage}."
        eff.customer_notice = f"Claim {c['id']} approved"
    elif action == "request_info":
        items = [str(i).strip() for i in body.get("items") or [] if str(i).strip()]
        _require(bool(items), "items", "Choose at least one item to request")
        to = a.to
        _decision(c)["info_request"] = {"items": items, "requested_at": _iso(now), "message": body.get("message") or None}
        ttype, text = "info_requested", "Information requested: " + ", ".join(items)
        eff.customer_message = f"To keep claim {c['id']} moving we need: {', '.join(items)}. You can upload them in the app or reply here."
        eff.customer_notice = f"We need a little more information for {c['id']}"
    elif action == "escalate_siu":
        to, ttype, text = a.to, "siu_referral", f"Referred to SIU by {who}"
    elif action == "reject":
        to = a.to
        _decision(c).update({"final_action": "reject", "decided_by": user["id"], "decided_at": _iso(now), "approved_amount": None})
        c["amount_approved"] = 0.0
        ttype, text = "declined", f"Declined by {who}"
        eff.customer_message = (f"We're sorry — after reviewing claim {c['id']} we are unable to approve it under your policy terms. "
                                "You can reply here or call us if you would like to discuss it.")
        eff.customer_notice = f"Update on claim {c['id']}"
    elif action == "settle":
        amount, ref, paid_on = body.get("amount"), (body.get("payment_reference") or "").strip(), body.get("date")
        _require(isinstance(amount, (int, float)) and amount > 0, "amount", "Enter the settled amount")
        _require(len(ref) >= 4, "payment_reference", "Enter the payment reference (UTR / cheque no.)")
        try:
            paid = date.fromisoformat(str(paid_on))
        except ValueError:
            raise ActionError(422, "validation", "Enter the payment date", {"date": "Enter the payment date"})
        _require(paid <= now.date(), "date", "The payment date cannot be in the future")
        to = a.to
        c["settlement"] = {**(c.get("settlement") or {}), "paid_amount": float(amount), "paid_on": paid.isoformat(), "payment_reference": ref,
                           "settled_by": user["id"]}
        ttype, text = "settled", f"Settled {inr(amount)} · ref {ref} · paid {paid.strftime('%d %b %Y')}"
        eff.customer_message = f"Payment of {inr(amount)} for claim {c['id']} has been made (reference {ref}). Thank you for your patience."
        eff.customer_notice = f"Claim {c['id']} settled"
    elif action == "confirm_fraud":
        to = a.to
        _decision(c).update({"final_action": "reject", "decided_by": user["id"], "decided_at": _iso(now), "approved_amount": None})
        c["amount_approved"] = 0.0
        ttype, text = "fraud_confirmed", f"Fraud confirmed by {who} after SIU investigation"
        # Customer sees only a neutral "not approved" (spec rule 5): never the internal reason.
        eff.customer_message = (f"We're sorry — after reviewing the documents and inspection findings, we are unable to approve claim "
                                f"{c['id']}. You can reply here or call us if you would like to discuss it.")
        eff.customer_notice = f"Update on claim {c['id']}"
    elif action == "clear_siu":
        to, ttype, text = a.to, "siu_cleared", f"SIU review cleared by {who} — back to handler review"
    elif action == "reassign":
        assignee = body.get("assignee")
        _require(assignee in people, "assignee", "Choose a claims handler")
        _require(assignee != c.get("assignee"), "assignee", "The claim is already assigned to this handler")
        to = None
        c["assignee"] = assignee
        ttype, text = "assigned", f"Assigned to {people[assignee]} by {who}"
    else:  # note
        note = (body.get("text") or reason).strip()
        _require(len(note) >= 2, "text", "Write the note")
        to = None
        c.setdefault("internal_notes", []).append({"id": f"note_{secrets.token_hex(3)}", "ts": _iso(now), "author": user["id"], "text": note[:2000]})
        reason, ttype, text = note[:200], None, ""

    override = recommended in DEFINITIVE and action in ALIGNED and recommended not in ALIGNED[action]
    if to:
        c["status"] = to
    c["updated_at"] = _iso(now)
    if ttype:
        c["timeline"].append({"ts": _iso(now), "actor": user["id"], "type": ttype,
                              "text": text + (f" · overrides AI recommendation ({recommended.replace('_', ' ')})" if override else "")})
    entry = {"ts": _iso(now), "actor": user["id"], "action": "status_change" if to else action, "op": action,
             "from": before if to else None, "to": to, "reason": reason}
    if action == "reassign":
        entry |= {"from": previous_assignee, "to": c["assignee"]}
    if action in ("approve", "approve_revised", "settle"):
        entry["amount"] = c["amount_approved"] if action != "settle" else c["settlement"]["paid_amount"]
    if override:
        entry["override"] = recommended
    c["audit"].append(entry)
    if to:
        eff.admin_notice = f"{c['id']} {STATUS_TEXT.get(to, to.replace('_', ' ').lower())} by {who}"
    elif action == "reassign":
        eff.admin_notice = f"{c['id']} assigned to {people[c['assignee']]}"
    return entry, eff


# An action overrides the AI when the AI made a definitive recommendation it contradicts ("review" leaves the call to the human).
DEFINITIVE = {"approve", "approve_revised", "approve_total_loss", "escalate_siu", "reject"}
_APPROVALS = {"approve", "approve_revised", "approve_total_loss"}
ALIGNED = {"approve": _APPROVALS, "approve_revised": _APPROVALS, "reject": {"reject"}, "escalate_siu": {"escalate_siu"},
           "confirm_fraud": {"escalate_siu"}, "clear_siu": _APPROVALS}


# ------------------------------------------------------------------------------------------------ undo

UNDO_FIELDS = ("status", "decision", "amount_approved", "assignee", "settlement", "internal_notes", "communications", "updated_at")
_undo: dict[str, dict] = {}


def snapshot(c: dict) -> dict:
    return {k: copy.deepcopy(c.get(k)) for k in UNDO_FIELDS}


def remember(action_id: str, claim_id: str, user_id: str, before: dict, after_updated_at: str, notification_ids: list[str],
             now: datetime) -> None:
    for k in [k for k, v in _undo.items() if (now - v["at"]).total_seconds() > UNDO_SECONDS + UNDO_GRACE]:
        _undo.pop(k, None)
    _undo[action_id] = {"claim_id": claim_id, "user_id": user_id, "before": before, "after": after_updated_at, "at": now,
                        "notifications": notification_ids}


def take_undo(action_id: str, claim: dict, user: dict, now: datetime) -> dict:
    """Validate and consume an undo token. Returns the stored record (snapshot + notification ids)."""
    rec = _undo.get(action_id)
    if not rec or rec["claim_id"] != claim["id"]:
        raise ActionError(409, "undo_expired", "This action can no longer be undone")
    if rec["user_id"] != user["id"]:
        raise ActionError(403, "undo_forbidden", "Only the person who made the change can undo it")
    if (now - rec["at"]).total_seconds() > UNDO_SECONDS + UNDO_GRACE:
        _undo.pop(action_id, None)
        raise ActionError(409, "undo_expired", "The undo window has passed")
    if claim["updated_at"] != rec["after"]:
        raise ActionError(409, "undo_stale", "The claim changed after this action, so it can no longer be undone")
    return _undo.pop(action_id)


def new_action_id() -> str:
    return "act_" + secrets.token_hex(6)


def undo_window_ends(now: datetime) -> str:
    return _iso(now + timedelta(seconds=UNDO_SECONDS))
