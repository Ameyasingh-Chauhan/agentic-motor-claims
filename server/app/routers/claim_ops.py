"""Claim Detail operations (spec §10.4, §17): handler actions + undo, internal notes, messages, customer info-request response,
audit CSV. All claims.json changes go through json_store.update_json (§11.6)."""
from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..services import claim_actions as A
from ..services.claim_detail import detail, message_channel
from ..services.claim_views import now_ist
from ..services.json_store import read_json, update_json
from .auth import current_user
from .filing import find, is_admin, iso, validated

router = APIRouter(prefix="/api/claims", tags=["claim-ops"])


class ActionBody(BaseModel):
    action: str
    reason: str | None = Field(None, max_length=1000)
    amount: float | None = None
    items: list[str] | None = None
    message: str | None = Field(None, max_length=1000)
    assignee: str | None = None
    payment_reference: str | None = Field(None, max_length=60)
    date: str | None = None
    text: str | None = Field(None, max_length=2000)
    action_id: str | None = None          # for action = "undo"


class NoteBody(BaseModel):
    text: str = Field(..., min_length=2, max_length=2000)


class MessageBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    draft_id: str | None = None


class RespondBody(BaseModel):
    message: str = Field("", max_length=2000)


def _admin(user: dict) -> None:
    if not is_admin(user):
        raise HTTPException(403, {"code": "forbidden", "message": "You don't have access"})


def _err(e: A.ActionError) -> HTTPException:
    return HTTPException(e.status, {"code": e.code, "message": e.message, "fields": e.fields})


async def _people() -> dict[str, str]:
    return {u["id"]: u.get("display_name") or u["username"] for u in await read_json("users.json", []) if u.get("role") == "admin"}


async def _customer_user(claim: dict) -> dict | None:
    return next((u for u in await read_json("users.json", []) if u.get("role") == "customer" and u.get("customer_id") == claim["customer_id"]), None)


async def _notify(rows_to_add: list[dict]) -> list[str]:
    """Append notifications (newest first); returns their ids so an undo can withdraw them."""
    if not rows_to_add:
        return []
    ids: list[str] = []

    def add(rows: list[dict]) -> None:
        n = max((int(r["id"].split("_")[1]) for r in rows if str(r.get("id", "")).startswith("n_") and r["id"].split("_")[1].isdigit()), default=-1)
        for r in rows_to_add:
            n += 1
            ids.append(f"n_{n:03d}")
            rows.insert(0, {"id": ids[-1], **r, "read": False})

    await update_json("notifications.json", add, [])
    return ids


async def _withdraw(ids: list[str]) -> None:
    if ids:
        await update_json("notifications.json", lambda rows: rows.__setitem__(slice(None), [r for r in rows if r.get("id") not in set(ids)]), [])


async def _respond(claim: dict, user: dict) -> dict:
    return await detail(claim, user, await read_json("claims.json", []))


@router.post("/{claim_id}/actions")
async def run_action(claim_id: str, body: ActionBody, user=Depends(current_user)):
    _admin(user)
    people = await _people()
    now = now_ist()

    if body.action == "undo":
        if not body.action_id:
            raise HTTPException(422, {"code": "validation", "message": "action_id is required", "fields": {"action_id": "required"}})
        record: dict[str, Any] = {}

        def undo(claims: list[dict]) -> dict:
            c = find(claims, claim_id, user)
            try:
                rec = A.take_undo(body.action_id, c, user, now)
            except A.ActionError as e:
                raise _err(e) from e
            last = next((e for e in reversed(c["audit"]) if e.get("action_id") == body.action_id), {})
            status_before = c["status"]
            c.update(rec["before"])
            c["updated_at"] = iso(now)
            label = A.MATRIX.get(last.get("op", ""), None)
            c["audit"].append({"ts": iso(now), "actor": user["id"], "action": "undo", "op": "undo", "undone": last.get("op"),
                               "from": status_before, "to": c["status"], "reason": f"Undone within {A.UNDO_SECONDS} s"})
            if last.get("op") != "note":
                c["timeline"].append({"ts": iso(now), "actor": user["id"], "type": "action_undone",
                                      "text": f"Undone: {label.label if label else 'last action'} ({people.get(user['id'], 'handler')})"})
            record.update(rec)
            return validated(c)

        claim = await update_json("claims.json", undo, [])
        await _withdraw(record.get("notifications", []))
        return {"claim": await _respond(claim, user), "undone": True}

    action_id = A.new_action_id()
    holder: dict[str, Any] = {}

    def act(claims: list[dict]) -> dict:
        c = find(claims, claim_id, user)
        before = A.snapshot(c)
        try:
            entry, eff = A.apply(c, body.action, body.model_dump(exclude_none=True), user, people, now)
        except A.ActionError as e:
            raise _err(e) from e
        entry["action_id"] = action_id
        if eff.customer_message:
            c["communications"].append({"id": f"msg_{len(c['communications']) + 1}", "channel": message_channel(c), "direction": "outbound",
                                        "status": "sent", "text": eff.customer_message, "draft": False, "created_at": iso(now),
                                        "by": user["id"]})
        holder.update(before=before, effects=eff, entry=entry)
        return validated(c)

    claim = await update_json("claims.json", act, [])
    eff: A.Effects = holder["effects"]
    rows = []
    customer = await _customer_user(claim)
    if customer and eff.customer_notice:
        rows.append({"user_id": customer["id"], "title": eff.customer_notice, "body": f"{claim['vehicle']['make']} {claim['vehicle']['model']}",
                     "href": f"/claims/{claim['id']}", "created_at": iso(now)})
    if eff.admin_notice:
        rows += [{"user_id": uid, "title": eff.admin_notice, "body": holder["entry"].get("reason", "")[:120], "href": f"/claims/{claim['id']}",
                  "created_at": iso(now)} for uid in (await _people()) if uid != user["id"]]
    notification_ids = await _notify(rows)
    A.remember(action_id, claim["id"], user["id"], holder["before"], claim["updated_at"], notification_ids, now)
    return {"claim": await _respond(claim, user), "action_id": action_id, "undo_until": A.undo_window_ends(now), "entry": holder["entry"]}


@router.post("/{claim_id}/notes")
async def add_note(claim_id: str, body: NoteBody, user=Depends(current_user)):
    return await run_action(claim_id, ActionBody(action="note", text=body.text), user)


@router.post("/{claim_id}/messages")
async def send_message(claim_id: str, body: MessageBody, user=Depends(current_user)):
    """Admin → customer (optionally sending an AI draft, edited or not); owner → reply on the thread."""
    now = now_ist()
    admin = is_admin(user)

    def send(claims: list[dict]) -> dict:
        c = find(claims, claim_id, user)
        if c["status"] == "DRAFT":
            raise HTTPException(409, {"code": "not_submitted", "message": "The claim has not been submitted yet"})
        msg = {"id": f"msg_{len(c['communications']) + 1}", "channel": message_channel(c), "direction": "outbound" if admin else "inbound",
               "status": "sent" if admin else "received", "text": body.text.strip(), "draft": False, "created_at": iso(now),
               "by": user["id"] if admin else "customer"}
        if admin and body.draft_id:
            msg["from_draft"] = body.draft_id
            c["communications"] = [m for m in c["communications"] if not (m.get("draft") and m.get("id") == body.draft_id)]
        c["communications"].append(msg)
        c["updated_at"] = iso(now)
        if not admin:
            c["timeline"].append({"ts": iso(now), "actor": "customer", "type": "customer_message", "text": "Customer replied on the thread"})
        return validated(c)

    claim = await update_json("claims.json", send, [])
    if admin:
        customer = await _customer_user(claim)
        if customer:
            await _notify([{"user_id": customer["id"], "title": f"New message about {claim['id']}", "body": body.text[:120],
                            "href": f"/claims/{claim['id']}", "created_at": iso(now)}])
    else:
        await _notify([{"user_id": uid, "title": f"Customer replied: {claim['id']}", "body": body.text[:120], "href": f"/claims/{claim['id']}",
                        "created_at": iso(now)} for uid in await _people()])
    return {"claim": await _respond(claim, user)}


@router.post("/{claim_id}/messages/draft")
async def regenerate_draft(claim_id: str, user=Depends(current_user)):
    """Regenerate the AI draft with the Communication agent (customer-safe facts only). Live when Gemini is available; otherwise the
    template draft, and the response says which."""
    _admin(user)
    from ..agents import communication as comm
    from ..agents.schemas import CommunicationOut
    from ..services import gemini, prompts

    claims = await read_json("claims.json", [])
    claim = find(claims, claim_id, user)
    if claim["status"] == "DRAFT":
        raise HTTPException(409, {"code": "not_submitted", "message": "The claim has not been submitted yet"})
    customers, garages = await read_json("customers.json", []), await read_json("garages.json", [])
    customer = next(c for c in customers if c["id"] == claim["customer_id"])
    garage = next((g for g in garages if g["id"] == (claim.get("settlement") or {}).get("garage_id")), None)
    purpose = comm.PURPOSE_BY_STATUS.get(claim["status"], "under_review")
    items = ((claim.get("decision") or {}).get("info_request") or {}).get("items") or []

    async def standalone(variables: dict):
        try:
            out, rec = await gemini.generate(agent="communication", system=prompts.render("communication", variables),
                                             contents=["Write the message now."], schema=CommunicationOut, temperature=0.5,
                                             thinking="low", max_output_tokens=4096)
            return out, "live"
        except gemini.GeminiError:
            return comm.template(claim, purpose, items, garage), "template"

    out, source = await comm.compose(None, claim, purpose=purpose, items=items, garage=garage, customer=customer,
                                     run_standalone=standalone)
    now = now_ist()

    def store(rows: list[dict]) -> dict:
        c = find(rows, claim_id, user)
        c["communications"] = [m for m in c["communications"] if not m.get("draft")]
        entry = comm.message_entry(c, out, draft=True, source=source)
        c["communications"].append(entry)
        c["updated_at"] = iso(now)
        validated(c)
        return entry

    entry = await update_json("claims.json", store, [])
    return {"draft": entry, "source": source}


@router.post("/{claim_id}/respond")
async def respond_to_info_request(claim_id: str, body: RespondBody, user=Depends(current_user)):
    """Customer answers an information request (files are uploaded first via POST /api/uploads) → back to handler review."""
    if user.get("role") != "customer":
        raise HTTPException(403, {"code": "forbidden", "message": "Only the policyholder can respond to an information request"})
    now = now_ist()

    def respond(claims: list[dict]) -> dict:
        c = find(claims, claim_id, user)
        if c["status"] != "INFO_REQUESTED":
            raise HTTPException(409, {"code": "no_request", "message": "There is no open information request on this claim"})
        requested = ((c.get("decision") or {}).get("info_request") or {}).get("requested_at") or c["created_at"]
        new_files = [i for i in c["media"] + c["documents"] if i.get("uploaded_at", "") >= requested and i.get("uploaded_by") == "customer"]
        if not body.message.strip() and not new_files:
            raise HTTPException(422, {"code": "validation", "message": "Add a message or upload the requested files",
                                      "fields": {"message": "Add a message or upload the requested files"}})
        if body.message.strip():
            c["communications"].append({"id": f"msg_{len(c['communications']) + 1}", "channel": message_channel(c), "direction": "inbound",
                                        "status": "received", "text": body.message.strip(), "draft": False, "created_at": iso(now), "by": "customer"})
        c["status"] = "UNDER_REVIEW"
        c["updated_at"] = iso(now)
        c["timeline"].append({"ts": iso(now), "actor": "customer", "type": "customer_responded",
                              "text": f"Customer responded to the information request ({len(new_files)} file(s))"})
        c["audit"].append({"ts": iso(now), "actor": user["id"], "action": "status_change", "op": "customer_response",
                           "from": "INFO_REQUESTED", "to": "UNDER_REVIEW", "reason": "Customer responded to the information request"})
        return validated(c)

    claim = await update_json("claims.json", respond, [])
    await _notify([{"user_id": uid, "title": f"Customer responded: {claim['id']}", "body": "Information request answered — back in review",
                    "href": f"/claims/{claim['id']}", "created_at": iso(now)} for uid in await _people()])
    return {"claim": await _respond(claim, user)}


@router.get("/{claim_id}/export.csv")
async def export_audit(claim_id: str, user=Depends(current_user)):
    _admin(user)
    claim = find(await read_json("claims.json", []), claim_id, user)
    people = await _people()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["timestamp", "actor", "actor_type", "action", "from", "to", "amount", "reason"])
    for e in claim["audit"]:
        actor = e["actor"]
        kind = "agent" if actor.startswith("agent:") else "system" if actor == "system" else "user"
        w.writerow([e["ts"], people.get(actor, actor), kind, e.get("op") or e["action"], e.get("from") or "", e.get("to") or "",
                    e.get("amount") or "", e.get("reason") or ""])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{claim_id}-audit.csv"'})

