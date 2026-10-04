"""Agent 3 — Verification & DPI (Python only, AGENT_PROMPTS.md A1): policy core, Vahan, FASTag, IIB, police and KYC mocks plus
geo maths. Each call is shown in the Theatre (tool_called / tool_result); a transient mock failure is retried once."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from ..mocks import services as mocks
from ..services.claim_detail import km
from ..services.json_store import read_json
from .base import RunContext

FASTAG_WINDOW = timedelta(minutes=90)     # FR-01: an event within ±90 min of the reported time…
FAR_KM = 25                               # …more than 25 km from the reported place
NEAR_KM = 15                              # a toll this close in that window corroborates the story


def check(level: str, summary: str, latency: int, data: dict | None = None) -> dict:
    return {"level": level, "summary": summary, "data": data or {}, "latency_ms": latency}


async def _call(ctx: RunContext, tool: str, label: str, fn, *args):
    await ctx.emit("tool_called", agent="verification", tool=tool, input_summary=label)
    flaky = ctx.mode != "demo" and not ctx.scenario_id
    for attempt in (1, 2):
        try:
            value, ms = await fn(*args, flaky=flaky and attempt == 1)
            return value, ms
        except mocks.MockTransientError as exc:
            await ctx.emit("agent_retry", agent="verification", attempt=attempt + 1, reason=f"{exc} — retrying")
    raise RuntimeError("unreachable")


def fastag_check(events: list[dict], incident: dict, vehicle_type: str, latency: int, theft: bool) -> tuple[dict, dict]:
    if vehicle_type == "2W":
        return check("pending", "Not applicable for two-wheelers", latency), {}
    at = datetime.fromisoformat(incident["datetime"])
    loc = incident["location"]
    near = []
    for e in events:
        t = datetime.fromisoformat(e["ts"])
        if abs(t - at) <= FASTAG_WINDOW and e.get("lat") is not None:
            near.append({**e, "distance_km": km(loc["lat"], loc["lng"], e["lat"], e["lng"]), "minutes": round((t - at).total_seconds() / 60)})
    far = [e for e in near if e["distance_km"] > FAR_KM]
    data = {"events_in_window": near, "window_minutes": 90}
    if far and not theft:
        e = far[0]
        when = datetime.fromisoformat(e["ts"]).strftime("%H:%M")
        evidence = (f"FASTag: {e['type']} event at {e['plaza']} ({e['city']}) at {when}, {e['distance_km']:.0f} km from the reported "
                    f"location, {abs(e['minutes'])} min {'before' if e['minutes'] < 0 else 'after'} the reported time")
        return check("fail", f"Vehicle at {e['plaza']} at {when}, {e['distance_km']:.0f} km away", latency, data), {"evidence": evidence}
    close = [e for e in near if e["distance_km"] <= NEAR_KM and e["type"] == "toll"]
    if close:
        e = close[0]
        return check("pass", f"{e['plaza']} toll at {datetime.fromisoformat(e['ts']).strftime('%H:%M')} — matches the reported route and time",
                     latency, data), {}
    return check("pass", "No contradicting toll or parking events", latency, data), {}


async def run(ctx: RunContext) -> dict:
    claim, v, pol = ctx.claim, ctx.vehicle, ctx.policy
    reg, inc = v["registration"], claim["incident"]
    at = datetime.fromisoformat(inc["datetime"])
    theft = claim["claim_type"] == "Theft"
    facts: dict = {}

    (policy_rec, p_ms), (vahan, v_ms), (events, f_ms), (iib, i_ms), (police, pol_ms), (kyc, k_ms) = await asyncio.gather(
        _call(ctx, "policy_core", f"Policy {pol['policy_no']}", mocks.policy, pol["policy_no"]),
        _call(ctx, "vahan", f"RC lookup {reg}", mocks.vahan, reg),
        _call(ctx, "fastag", f"Toll and parking events for {reg}", mocks.fastag, reg),
        _call(ctx, "iib", f"Claims history for {reg}", mocks.iib, reg),
        _call(ctx, "police", f"FIR / stolen-vehicle records for {reg}", mocks.police, reg),
        _call(ctx, "ckyc", "KYC registry", mocks.kyc, claim["customer_id"]))
    policy_rec = policy_rec or pol

    # --- policy ---
    start, end = datetime.fromisoformat(policy_rec["start"]).date(), datetime.fromisoformat(policy_rec["end"]).date()
    active = policy_rec.get("status", "active") in ("active", "expired") and start <= at.date() <= end
    od_on_tp = claim["claim_type"] in ("OD", "Glass", "Theft", "Total loss") and policy_rec["cover"] == "TP"
    early = active and (at.date() - start).days < 30
    facts |= {"policy_active": active, "od_on_tp_only": od_on_tp, "early_claim": early, "days_since_start": (at.date() - start).days}
    if not active:
        c = check("fail", f"Not active on the incident date (cover {start:%d %b %Y} – {end:%d %b %Y})", p_ms)
    elif od_on_tp:
        c = check("fail", "Third-party-only cover — own damage is not covered", p_ms)
    else:
        c = check("warn" if early else "pass", f"Active · {policy_rec['cover']} · valid till {end:%d %b %Y}"
                  + (" · incident within 30 days of inception" if early else ""), p_ms,
                  {"policy_no": policy_rec["policy_no"], "cover": policy_rec["cover"], "start": policy_rec["start"], "end": policy_rec["end"]})
    checks = {"policy": c}

    # --- Vahan ---
    stolen_before = bool(vahan.get("stolen")) and not theft
    blacklisted = bool(vahan.get("blacklisted"))
    from .document import name_ratio
    owner_ratio = name_ratio(vahan.get("owner"), ctx.customer["name"]) if vahan.get("owner") else None
    facts |= {"blacklisted_or_stolen": blacklisted or stolen_before, "vahan_owner_ratio": owner_ratio, "vahan": vahan}
    if blacklisted or stolen_before:
        checks["vahan"] = check("fail", "Vehicle flagged as " + ("blacklisted" if blacklisted else "reported stolen"), v_ms, vahan)
    elif owner_ratio is not None and owner_ratio < 0.85:
        checks["vahan"] = check("warn", "RC owner differs from policyholder", v_ms, vahan)
    elif vahan.get("rc_status") not in (None, "active"):
        checks["vahan"] = check("warn", f"RC status: {vahan['rc_status']}", v_ms, vahan)
    else:
        checks["vahan"] = check("pass", f"RC active · {v.get('use', 'private').title()} · not blacklisted"
                                + (" · hypothecated" if vahan.get("hypothecation") else ""), v_ms, vahan)

    # --- FASTag ---
    checks["fastag"], fr01 = fastag_check(events, inc, v["type"], f_ms, theft)
    facts |= {"location_contradiction": bool(fr01), "fastag_evidence": fr01.get("evidence")}

    # --- IIB + ABC's own history (all insurers) ---
    claims = await read_json("claims.json", [])
    year_ago = at - timedelta(days=365)
    iib_od = [e for e in iib if e.get("type") == "OD" and datetime.fromisoformat(e["date"]).date() >= year_ago.date()]
    own = [c for c in claims if c["registration"] == reg and c["id"] not in (claim["id"], claim.get("replay_of")) and c["status"] not in ("DRAFT", "WITHDRAWN")
           and c["claim_type"] in ("OD", "Total loss", "Glass") and datetime.fromisoformat(c["created_at"]) >= year_ago]
    n_od = len(iib_od) + len(own)
    facts |= {"od_claims_12m": n_od}
    checks["iib"] = check("warn" if n_od >= 2 else "pass",
                          f"{n_od} OD claim(s) in the last 12 months" + (f" ({len(iib_od)} with other insurers)" if iib_od else ""), i_ms,
                          {"other_insurers": iib_od, "abc_claims": [c["id"] for c in own]})

    # --- police ---
    fir = inc.get("fir") or next((d.get("extracted") for d in claim.get("documents", []) if d.get("requirement") == "fir"), None)
    if theft or inc.get("injuries"):
        checks["police"] = check("pass" if fir else "warn", f"FIR {fir.get('number') or fir.get('fir_no') or fir.get('fir_number')} on record"
                                 if fir else "FIR required — not yet provided", pol_ms, {"records": police})
    else:
        checks["police"] = check("pending", "Not required", pol_ms, {"records": police})

    # --- KYC ---
    checks["kyc"] = check("pass" if (kyc or {}).get("verified") else "warn",
                          "KYC verified" if (kyc or {}).get("verified") else "KYC not verified", k_ms)

    for key, c in checks.items():
        await ctx.emit("tool_result", agent="verification", tool=key, level=c["level"], summary=c["summary"], latency_ms=c["latency_ms"])
    return {"checks": checks, "facts": facts}
