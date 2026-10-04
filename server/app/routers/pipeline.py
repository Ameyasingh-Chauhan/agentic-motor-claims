"""Pipeline run state and SSE stream (spec §15.4, §17). Owner or admin only; customers receive customer-safe events."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from ..agents.base import DISPLAY
from ..services import pipeline_bus
from ..services.json_store import read_json
from .auth import current_user
from .filing import find

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

CUSTOMER_TEXT = {"intake": "Reading your claim details", "document": "Checking your documents", "verification": "Confirming your policy",
                 "damage": "Assessing the damage", "fraud": "Final checks", "adjudication": "Preparing the outcome",
                 "communication": "Preparing your update"}


async def _authorised_run(run_id: str, user: dict) -> dict:
    run = await pipeline_bus.get_run(run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    find(await read_json("claims.json", []), run["claim_id"], user)  # 404 for anyone but the owner or an admin
    return run


def customer_safe(ev: dict) -> dict | None:
    """Customers see agent start/finish with neutral text and the outcome message — never tools, rules, scores or routes."""
    e, d = ev["event"], ev["data"]
    if e in ("run_started", "heartbeat"):
        return {**ev, "data": {k: d.get(k) for k in ("run_id", "claim_id", "pace", "ts") if k in d}}
    if e == "agent_started":
        return {**ev, "data": {"agent": d["agent"], "display_name": CUSTOMER_TEXT.get(d["agent"], DISPLAY.get(d["agent"])), "stage": d.get("stage"),
                               "ts": d["ts"]}}
    if e == "agent_completed":
        return {**ev, "data": {"agent": d["agent"], "level": "pass", "summary": "Done", "duration_ms": d.get("duration_ms"), "ts": d["ts"]}}
    if e == "decision":
        return {**ev, "data": {"customer_message": d.get("customer_message"), "ts": d["ts"]}}
    if e in ("run_completed", "run_failed"):
        return {**ev, "data": {k: d.get(k) for k in ("run_id", "claim_id", "duration_ms", "ts")}
                | ({"message": "We'll update you shortly."} if e == "run_failed" else {})}
    return None


def public_run(run: dict, user: dict) -> dict:
    keys = ("id", "claim_id", "status", "mode", "pace", "started_at", "finished_at", "duration_ms")
    out = {k: run.get(k) for k in keys} | {"last_event_id": len(run.get("events", []))}
    if user.get("role") == "admin":
        out |= {"agents": run.get("agents", {}), "totals": run.get("totals", {}), "result": run.get("result")}
    return out


@router.get("/{run_id}")
async def run_state(run_id: str, user=Depends(current_user)):
    return public_run(await _authorised_run(run_id, user), user)


@router.get("/{run_id}/events")
async def run_events(run_id: str, request: Request, user=Depends(current_user)):
    await _authorised_run(run_id, user)
    raw = request.headers.get("last-event-id") or request.query_params.get("lastEventId") or "0"
    last = int(raw) if raw.isdigit() else 0
    customer = user.get("role") == "customer"

    async def stream():
        async for ev in pipeline_bus.subscribe(run_id, last):
            if await request.is_disconnected():
                break
            if ev["event"] == "heartbeat":
                yield {"event": "heartbeat", "data": "{}"}
                continue
            out = customer_safe(ev) if customer else ev
            if out is not None:
                yield {"id": str(ev["id"]), "event": ev["event"], "data": json.dumps(out["data"], ensure_ascii=False)}
            elif customer:
                continue

    return EventSourceResponse(stream(), ping=20)
