"""Pipeline run store + SSE event bus (spec §15.4).

Every event gets an incrementing integer id per run and is appended to the run in `pipeline_runs.json` (through json_store) as
well as to an in-memory list that live subscribers wait on. A subscriber that reconnects with `Last-Event-ID` gets every event
after that id replayed first — from memory, or from the file after a restart — so closing the browser mid-run and reopening
resumes the Theatre. Runs execute server-side, independent of any browser.

A run left "running" by a server restart is marked "interrupted" at startup (a run_failed event is appended), so a client never
waits on a run that no longer exists.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

from .json_store import read_json, update_json

FILE = "pipeline_runs.json"
KEEP_RUNS = 40
TERMINAL = {"run_completed", "run_failed"}
IST = timezone(timedelta(hours=5, minutes=30))


def now_iso() -> str:
    return datetime.now(IST).isoformat(timespec="milliseconds")


class _Live:
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.cond = asyncio.Condition()
        self.done = False


_live: dict[str, _Live] = {}


def _find(runs: list[dict], run_id: str) -> dict | None:
    return next((r for r in runs if r["id"] == run_id), None)


async def next_run_id() -> str:
    runs = await read_json(FILE, [])
    n = max((int(r["id"].split("_")[1]) for r in runs if str(r.get("id", "")).startswith("run_") and r["id"].split("_")[1].isdigit()),
            default=0)
    return f"run_{n + 1:06d}"


async def create_run(run_id: str, claim_id: str, *, mode: str, pace: str, trigger: str) -> dict:
    run = {"id": run_id, "claim_id": claim_id, "status": "running", "mode": mode, "pace": pace, "trigger": trigger,
           "started_at": now_iso(), "finished_at": None, "duration_ms": None, "events": [], "calls": [], "agents": {},
           "totals": {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "total_tokens": 0, "llm_calls": 0, "llm_latency_ms": 0}}

    def add(runs: list[dict]) -> None:
        runs.append(run)
        del runs[:-KEEP_RUNS]

    await update_json(FILE, add, [])
    _live[run_id] = _Live()
    return run


async def emit(run_id: str, event: str, data: dict) -> dict:
    live = _live.setdefault(run_id, _Live())
    ev = {"id": len(live.events) + 1, "event": event, "data": {**data, "ts": data.get("ts") or now_iso()}}

    def add(runs: list[dict]) -> None:
        run = _find(runs, run_id)
        if run is not None:
            ev["id"] = len(run["events"]) + 1
            run["events"].append(ev)

    await update_json(FILE, add, [])
    async with live.cond:
        live.events.append(ev)
        if event in TERMINAL:
            live.done = True
        live.cond.notify_all()
    return ev


async def update_run(run_id: str, **fields) -> None:
    def upd(runs: list[dict]) -> None:
        run = _find(runs, run_id)
        if run is not None:
            for k, v in fields.items():
                if k == "agents":
                    run["agents"].update(v)
                else:
                    run[k] = v

    await update_json(FILE, upd, [])


async def add_call(run_id: str, call: dict) -> None:
    def add(runs: list[dict]) -> None:
        run = _find(runs, run_id)
        if run is None:
            return
        run["calls"].append(call)
        if call.get("model") == "demo":   # recorded only so the inspector shows the rendered prompt; no model call was made
            return
        t = run["totals"]
        t["input_tokens"] += call.get("input_tokens", 0)
        t["output_tokens"] += call.get("output_tokens", 0)
        t["thinking_tokens"] += call.get("thinking_tokens", 0)
        t["total_tokens"] = t["input_tokens"] + t["output_tokens"] + t["thinking_tokens"]
        t["llm_calls"] += 1
        t["llm_latency_ms"] += call.get("latency_ms", 0)

    await update_json(FILE, add, [])


async def get_run(run_id: str) -> dict | None:
    return _find(await read_json(FILE, []), run_id)


async def latest_for_claim(claim_id: str) -> dict | None:
    runs = [r for r in await read_json(FILE, []) if r["claim_id"] == claim_id]
    return runs[-1] if runs else None


def is_running(run_id: str) -> bool:
    live = _live.get(run_id)
    return bool(live and not live.done)


async def subscribe(run_id: str, last_id: int = 0, heartbeat_s: float = 15.0) -> AsyncIterator[dict]:
    """Yield events after `last_id`, then live ones until the run ends. `{"event": "heartbeat"}` while idle."""
    live = _live.get(run_id)
    if live is None:  # finished before this process started (or interrupted): replay from the file
        run = await get_run(run_id)
        for ev in (run or {}).get("events", []):
            if ev["id"] > last_id:
                yield ev
        return
    sent = last_id
    while True:
        async with live.cond:
            pending = [e for e in live.events if e["id"] > sent]
            if not pending and not live.done:
                try:
                    await asyncio.wait_for(live.cond.wait(), timeout=heartbeat_s)
                except asyncio.TimeoutError:
                    pass
                pending = [e for e in live.events if e["id"] > sent]
            done = live.done
        if not pending and not done:
            yield {"id": None, "event": "heartbeat", "data": {}}
            continue
        for ev in pending:
            sent = ev["id"]
            yield ev
        if done and sent >= len(live.events):
            return


async def mark_interrupted_runs() -> int:
    """Startup: runs still "running" belong to a previous process — close them so no client waits forever."""
    count = 0

    def fix(runs: list[dict]) -> None:
        nonlocal count
        for run in runs:
            if run.get("status") == "running":
                count += 1
                run["status"] = "interrupted"
                run["finished_at"] = now_iso()
                run["events"].append({"id": len(run["events"]) + 1, "event": "run_failed",
                                      "data": {"run_id": run["id"], "error_id": "interrupted", "ts": now_iso(),
                                               "message": "The server restarted during this run. Re-run the pipeline from Dev Tools."}})

    await update_json(FILE, fix, [])
    return count
