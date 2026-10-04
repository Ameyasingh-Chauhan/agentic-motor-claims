"""Orchestrator (spec §15.3, AGENT_PROMPTS.md A1).

stage 1  intake                                   (skipped when the wizard captured it)
stage 2  gather(document, verification, damage)   (parallel; damage then waits for the RC reading to settle vehicle identity)
stage 3  costing (Python) → fraud (DMN) → adjudication policy (Python) → ONE investigation call explaining both
stage 4  communication
finalise write the claim (§11.6): status, checks, documents, damage, financials, fraud, decision, message, timeline, audit

Runs execute as server-side tasks, independent of any browser. Presentation pace keeps each agent's visible "working" state for at
least PIPELINE_MIN_STEP_MS; fast pace adds no padding. An agent that raises is replaced by its conservative default — the run never
hangs — and a crash of the run itself still leaves the claim with the handler ("Automated step unavailable").
"""
from __future__ import annotations

import asyncio
import copy
import logging
import os
import time
import traceback
from datetime import datetime, timedelta

from ..config import get_settings
from ..schemas.claim import Claim
from ..services import gemini, pipeline_bus, vehicle_identity
from ..services.claim_views import now_ist
from ..services.json_store import read_json, update_json
from . import adjudication as adj
from . import communication, damage, document, fraud, intake, verification
from .base import DISPLAY, STAGE, RunContext

log = logging.getLogger("amc.pipeline")
_tasks: set[asyncio.Task] = set()
STATUS_TEXT = {"PREAUTH_ISSUED": "Cashless pre-authorisation issued", "APPROVED": "Approved", "UNDER_REVIEW": "Routed to claims handler",
               "SIU_INVESTIGATION": "Referred to SIU", "INFO_REQUESTED": "Information requested from customer"}
ACTION_TEXT = {"auto_preauth": "Auto pre-authorise", "auto_approve": "Auto approve", "escalate_siu": "Escalate to SIU",
               "route_handler": "Route to claims handler", "total_loss": "Total loss — settle on IDV basis",
               "request_info": "Request information", "approve_revised": "Approve at the assessed amount", "decline": "Recommend decline"}


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


async def start(claim_id: str, *, pace: str = "presentation", trigger: str = "submit", force_mode: str | None = None) -> str:
    mode = force_mode or ("demo" if gemini.effective_mode() == "demo" else "live")
    run_id = await pipeline_bus.next_run_id()
    await pipeline_bus.create_run(run_id, claim_id, mode=mode, pace=pace, trigger=trigger)
    if os.environ.get("AMC_PIPELINE_AUTOSTART") == "0":   # tests drive run() themselves (deterministic, same event loop)
        return run_id
    task = asyncio.create_task(run(run_id, claim_id, pace=pace, mode=mode))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return run_id


async def _context(run_id: str, claim_id: str, mode: str, pace: str) -> RunContext:
    claims, policies, vehicles, customers, garages, cities = await asyncio.gather(
        read_json("claims.json", []), read_json("policies.json", []), read_json("vehicles.json", []), read_json("customers.json", []),
        read_json("garages.json", []), read_json("cities.json", []))
    claim = copy.deepcopy(next(c for c in claims if c["id"] == claim_id))
    policy = next(p for p in policies if p["policy_no"] == claim["policy_no"])
    vehicle = next(v for v in vehicles if v["id"] == claim["vehicle_id"] and v["registration"] == claim["registration"])
    customer = next(c for c in customers if c["id"] == claim["customer_id"])
    gid = (claim.get("settlement") or {}).get("garage_id")
    garage = next((g for g in garages if g["id"] == gid), None)
    city = next((c for c in cities if c["city"].casefold() == (claim["incident"]["location"].get("city") or claim["city"]).casefold()),
                None) or next((c for c in cities if c["city"].casefold() == customer["city"].casefold()), {"tier": 1})
    min_ms = get_settings().pipeline_min_step_ms if pace == "presentation" else 0
    return RunContext(run_id=run_id, claim=claim, policy=policy, vehicle=vehicle, customer=customer, garage=garage, city=city,
                      mode=mode, pace_ms=min_ms)


async def _step(ctx: RunContext, agent: str, fn, summarise) -> dict:
    """agent_started → fn() → (pad to the minimum step time) → agent_completed. An exception becomes the agent's fallback."""
    t0 = time.perf_counter()
    await ctx.emit("agent_started", agent=agent, display_name=DISPLAY[agent], stage=STAGE[agent])
    try:
        out = await fn()
    except Exception as exc:  # noqa: BLE001 — the pipeline must never hang on one agent
        log.exception("agent %s crashed", agent)
        ctx.sources[agent] = "fallback"
        if agent not in ctx.degraded:
            ctx.degraded.append(agent)
        await ctx.emit("agent_fallback", agent=agent, reason=f"{exc.__class__.__name__}: {str(exc)[:160]} — conservative default")
        out = None
    ctx.outputs[agent] = out
    level, summary = summarise(out)
    elapsed = (time.perf_counter() - t0) * 1000
    if elapsed < ctx.pace_ms:
        await asyncio.sleep((ctx.pace_ms - elapsed) / 1000)
    duration = int((time.perf_counter() - t0) * 1000)
    if ctx.sources.get(agent) in ("fallback", "demo") and level == "pass":
        level = "warn" if ctx.sources[agent] == "fallback" else level
    await ctx.emit("agent_completed", agent=agent, level=level, summary=summary, duration_ms=duration, output_ref=f"outputs.{agent}",
                   source=ctx.sources.get(agent, "python"))
    await pipeline_bus.update_run(ctx.run_id, agents={agent: {"level": level, "summary": summary, "duration_ms": duration,
                                                                "source": ctx.sources.get(agent, "python")}})
    return out


def _worst(levels) -> str:
    levels = [x for x in levels if x in ("pass", "warn", "fail")]
    return "fail" if "fail" in levels else ("warn" if "warn" in levels else "pass")


async def run(run_id: str, claim_id: str, *, pace: str, mode: str) -> None:
    t_run = time.perf_counter()
    started = now_ist()
    try:
        ctx = await _context(run_id, claim_id, mode, pace)
        await _set_processing(claim_id, run_id, started)
        await ctx.emit("run_started", run_id=run_id, claim_id=claim_id, mode=mode, pace=pace)
        claim = ctx.claim

        # ---- stage 1
        await _step(ctx, "intake", lambda: intake.run(ctx), lambda o: ("pass" if o else "warn",
                    f"{(o or {}).get('language_label') or 'Statement'} · {len((o or {}).get('parts_mentioned') or [])} part(s) mentioned"
                    if o else "Using the form details"))

        # ---- stage 2 (parallel)
        state: dict = {}

        async def doc_fn():
            out = await document.run(ctx)
            now = iso(now_ist())
            document.apply(claim, out or {"documents": []}, now=now)
            document.add_digital(claim, customer=ctx.customer, policy=ctx.policy, now=now)
            state["dl"] = document.dl_check(claim, ctx.vehicle["type"])
            return out

        def doc_sum(o):
            read = (o or {}).get("documents", [])
            statuses = [d.get("status") for d in claim.get("documents", []) if d["id"] in {r["doc_id"] for r in read}]
            lvl = "fail" if "mismatch" in statuses else ("warn" if {"flagged", "received"} & set(statuses) else "pass")
            if read:
                return lvl, f"{len(read)} document(s) read · {statuses.count('verified')} verified"
            pre = [d for d in claim.get("documents", []) if (d.get("ai") or {}).get("read_at")]
            if pre:   # already read live in the wizard (POST /api/documents/extract)
                st = [d["status"] for d in pre]
                return ("fail" if "mismatch" in st else "warn" if "flagged" in st else "pass",
                        f"{len(pre)} document(s) read in the wizard · {st.count('verified')} verified")
            return "pass", "No document images to read"

        doc_task = asyncio.create_task(_step(ctx, "document", doc_fn, doc_sum))

        async def ver_fn():
            return await verification.run(ctx)

        def ver_sum(o):
            checks = (o or {}).get("checks", {})
            done = [c for c in checks.values() if c["level"] != "pending"]
            return _worst(c["level"] for c in done), f"{sum(c['level'] == 'pass' for c in done)} of {len(done)} checks passed"

        ver_task = asyncio.create_task(_step(ctx, "verification", ver_fn, ver_sum))

        async def dmg_fn():
            out = await damage.run(ctx)
            ids = {m["id"] for m in claim.get("media", []) if m["kind"] == "photo"}
            block, cost_items, front, cat_sum = damage.build_damage(out or {}, model_key=ctx.vehicle["model_key"], photo_ids=ids)
            state["damage"], state["cost"] = block, (cost_items, front, cat_sum, (out or {}).get("llm_estimate_inr"))
            await doc_task  # identity compares with the RC reading
            rc = next((d.get("extracted") or {} for d in claim["documents"] if d.get("requirement") == "rc" or d.get("type") == "RC"), None)
            vahan_rec = None
            if ctx.sources.get("damage") == "live" and (out or {}).get("photos"):
                from ..mocks import services as mocks
                vahan_rec, _ = await mocks.vahan(ctx.vehicle["registration"])
                state["identity"] = vehicle_identity.compare(out, vehicle=ctx.vehicle, vahan=vahan_rec, rc=rc)
                ident = state["identity"]
                await ctx.progress("damage", f"Vehicle identity: {ident['summary']}",
                                   {"consistent": "pass", "unclear": "warn", "mismatch": "fail"}[ident["status"]])
            elif (out or {}).get("no_photos"):
                state["identity"] = vehicle_identity.not_assessed("No photos supplied")
            elif ctx.mode == "demo":
                state["identity"] = vehicle_identity.not_assessed("Not assessed — demo mode (pre-recorded AI outputs)")
            else:
                state["identity"] = vehicle_identity.not_assessed("Not assessed — automated step unavailable")
            return out

        def dmg_sum(o):
            b = state.get("damage") or {}
            ident = state.get("identity") or {}
            lvl = _worst([("fail" if ident.get("status") == "mismatch" else "warn" if ident.get("status") == "unclear" else "pass"),
                          "fail" if b.get("pre_existing") else "pass",
                          "warn" if not (b.get("narrative_consistency") or {}).get("consistent", True) else "pass"])
            return lvl, (f"{len(b.get('items', []))} part(s) · {b.get('overall_severity', '—')} · identity {ident.get('status', '—').replace('_', ' ')}"
                         if o and not o.get("no_photos") else "No photos to assess")

        dmg_task = asyncio.create_task(_step(ctx, "damage", dmg_fn, dmg_sum))
        await asyncio.gather(doc_task, ver_task, dmg_task)

        ver = ctx.outputs.get("verification") or {"checks": {}, "facts": {}}
        ver["checks"]["dl"] = state.get("dl") or document.dl_check(claim, ctx.vehicle["type"])
        block = state.get("damage") or damage.build_damage({}, model_key=ctx.vehicle["model_key"], photo_ids=set())[0]
        cost_items, front, cat_sum, llm_est = state.get("cost") or ([], False, 0.0, None)
        identity = state.get("identity") or vehicle_identity.not_assessed("Not assessed")
        financials = damage.price(ctx, cost_items, front, cat_sum, llm_est)
        claim["document_conditions"] = sorted(set(claim.get("document_conditions") or []) |
                                              set(adj.conditions_for(claim, vahan=ver.get("facts", {}).get("vahan"), policy=ctx.policy)))

        # ---- stage 3: fraud (DMN) + adjudication (policy) + one investigation call
        claims_all, customers = await asyncio.gather(read_json("claims.json", []), read_json("customers.json", []))
        cust_by_id = {c["id"]: c for c in customers}
        requirements = await read_json("document_requirements.json", {})
        await ctx.emit("agent_started", agent="fraud", display_name=DISPLAY["fraud"], stage=STAGE["fraud"])
        t_fraud = time.perf_counter()
        context = fraud.dmn_context(ctx, verification=ver, damage_block=block, financials=financials, documents=claim["documents"],
                                    identity=identity, dl=ver["checks"]["dl"], claims=claims_all, customers=cust_by_id)
        result = fraud.score(context)
        await ctx.emit("tool_called", agent="fraud", tool="dmn_engine", input_summary=f"{len(result['fired']) + len(result['not_fired'])} rules")
        for f in result["fired"]:
            await ctx.progress("fraud", f"{f['rule_id']} {f['name']} · +{f['points']}", f["level"])
        await ctx.emit("tool_result", agent="fraud", tool="dmn_engine", level={"low": "pass", "medium": "warn", "high": "fail"}[result["band"]],
                       summary=f"Score {result['score']} ({result['band']})", latency_ms=int((time.perf_counter() - t_fraud) * 1000))

        await ctx.emit("agent_started", agent="adjudication", display_name=DISPLAY["adjudication"], stage=STAGE["adjudication"])
        t_adj = time.perf_counter()
        missing, unreadable, all_verified = adj.required_documents(claim, requirements)
        exclusions = [ver["checks"]["dl"]["summary"]] if ver["checks"]["dl"].get("invalid") else []
        is_tl = financials["total_loss_check"]["is_total_loss"] and claim["claim_type"] != "Theft"
        facts = adj.Facts(
            policy_active=ver["facts"].get("policy_active", True), od_on_tp_only=ver["facts"].get("od_on_tp_only", False),
            exclusions=exclusions, hard_stop=result["hard_stop"], score=result["score"], band=result["band"],
            fired={f["rule_id"]: f["points"] for f in result["fired"]},
            failed_rules=[f["rule_id"] for f in result["fired"] if f["level"] == "fail"], is_total_loss=is_tl, docs_missing=missing,
            docs_unreadable=unreadable, docs_all_verified=all_verified, net_payable=financials["net_payable"],
            settlement_mode=(claim.get("settlement") or {}).get("mode", "reimbursement"),
            garage_network=bool((ctx.garage or {}).get("cashless")),
            degraded=[a for a in ctx.degraded if a in ("document", "damage", "verification")])
        decision = adj.decide(facts)
        await ctx.progress("adjudication", f"Policy {decision['rule']}: {ACTION_TEXT[decision['action']]}",
                           {"auto": "pass", "handler": "warn", "SIU": "fail"}[decision["route"]])
        docs_line = (f"missing {', '.join(missing)}" if missing else "all mandatory present") + \
                    (f"; unreadable {', '.join(unreadable)}" if unreadable else "") + ("; all verified" if all_verified else "; not all verified")
        facts_text = fraud.facts_block(ctx, verification=ver, damage_block=block, financials=financials, identity=identity, docs_line=docs_line)
        inv = await fraud.investigate(ctx, result=result, decision=decision, facts=facts_text)
        ctx.sources["adjudication"] = ctx.sources.get("fraud", "python")
        for step, t_start, lvl, summ in (
                ("fraud", t_fraud, {"low": "pass", "medium": "warn", "high": "fail"}[result["band"]], f"Score {result['score']} ({result['band']})"),
                ("adjudication", t_adj, {"auto": "pass", "handler": "warn", "SIU": "fail"}[decision["route"]], ACTION_TEXT[decision["action"]])):
            elapsed = (time.perf_counter() - t_start) * 1000
            if elapsed < ctx.pace_ms:
                await asyncio.sleep((ctx.pace_ms - elapsed) / 1000)
            dur = int((time.perf_counter() - t_start) * 1000)
            await ctx.emit("agent_completed", agent=step, level=lvl, summary=summ, duration_ms=dur, output_ref=f"outputs.{step}",
                           source=ctx.sources.get(step, "python"))
            await pipeline_bus.update_run(run_id, agents={step: {"level": lvl, "summary": summ, "duration_ms": dur,
                                                                 "source": ctx.sources.get(step, "python")}})

        # ---- stage 4: communication
        status = decision["status"]
        items = decision["info_items"]
        if status == "SIU_INVESTIGATION":
            items = [i for i in inv.customer_items if communication.is_customer_safe(i)][:4] or \
                [f["customer_safe_reason"] for f in result["fired"] if f.get("customer_safe_reason")][:3]
        purpose = {"INFO_REQUESTED": "info_request", "SIU_INVESTIGATION": "info_request" if items else "under_review"}.get(
            status, communication.PURPOSE_BY_STATUS.get(status, "under_review"))
        msg_claim = {**claim, "financials": financials}

        async def comm_fn():
            out, source = await communication.compose(ctx, msg_claim, purpose=purpose, items=items, garage=ctx.garage, customer=ctx.customer)
            ctx.sources["communication"] = source if source == "template" else ctx.sources.get("communication", source)
            return {"message": out.model_dump(mode="json"), "purpose": purpose, "source": source}

        comm = await _step(ctx, "communication", comm_fn, lambda o: ("pass" if o else "warn",
                                                                    f"{(o or {}).get('purpose', 'update').replace('_', ' ').title()} message sent"))

        # ---- finalise
        duration_ms = int((time.perf_counter() - t_run) * 1000)
        final = await _finalise(ctx, claim, ver=ver, block=block, financials=financials, identity=identity, result=result,
                                decision=decision, inv=inv, comm=comm, items=items, started=started, duration_ms=duration_ms)
        await ctx.emit("decision", route=decision["route"], recommended_action=decision["recommended_action"], action=decision["action"],
                       score=result["score"], band=result["band"], net_payable=financials["net_payable"],
                       customer_message=(comm or {}).get("message", {}).get("message_local"), status=final["status"])
        run_rec = await pipeline_bus.get_run(run_id)
        await pipeline_bus.update_run(run_id, status="completed", finished_at=pipeline_bus.now_iso(), duration_ms=duration_ms,
                                      result={"status": final["status"], "action": decision["action"], "score": result["score"],
                                              "net_payable": financials["net_payable"], "identity": identity["status"],
                                              "sources": ctx.sources, "degraded": ctx.degraded})
        await ctx.emit("run_completed", run_id=run_id, claim_id=claim_id, duration_ms=duration_ms, status=final["status"],
                       tokens=(run_rec or {}).get("totals", {}).get("total_tokens", 0))
    except Exception as exc:  # noqa: BLE001
        log.error("pipeline %s failed: %s\n%s", run_id, exc, traceback.format_exc())
        await _fail_safe(claim_id, run_id, str(exc))
        await pipeline_bus.update_run(run_id, status="failed", finished_at=pipeline_bus.now_iso(), error=str(exc)[:500])
        await pipeline_bus.emit(run_id, "run_failed", {"run_id": run_id, "error_id": run_id, "message": "The pipeline stopped unexpectedly; "
                                                       "the claim has been routed to a claims handler."})


async def _set_processing(claim_id: str, run_id: str, now: datetime) -> None:
    def upd(claims: list[dict]) -> None:
        c = next(c for c in claims if c["id"] == claim_id)
        prev = c["status"]
        c["status"], c["pipeline_run_id"], c["updated_at"] = "PROCESSING", run_id, iso(now)
        c["audit"].append({"ts": iso(now), "actor": "system", "action": "status_change", "from": prev, "to": "PROCESSING",
                           "reason": f"AI pipeline started ({run_id})"})

    await update_json("claims.json", upd, [])


async def _assignee(claims: list[dict]) -> str | None:
    admins = [u["id"] for u in await read_json("users.json", []) if u.get("role") == "admin"]
    if not admins:
        return None
    open_ = {"UNDER_REVIEW", "SIU_INVESTIGATION", "INFO_REQUESTED"}
    load = {a: sum(1 for c in claims if c.get("assignee") == a and c["status"] in open_) for a in admins}
    return min(admins, key=lambda a: (load[a], a))


async def _finalise(ctx: RunContext, claim: dict, *, ver, block, financials, identity, result, decision, inv, comm, items, started,
                    duration_ms) -> dict:
    now = now_ist()
    intake_out = ctx.outputs.get("intake") or {}
    cards = {c.rule_id: c for c in inv.evidence_cards}
    fired = []
    for f in result["fired"]:
        card = cards.get(f["rule_id"])
        fired.append({k: f[k] for k in ("rule_id", "name", "level", "points", "evidence", "evidence_refs", "confidence")}
                     | ({"expected": card.expected, "found": card.found, "source": card.source, "why": card.why} if card else {}))
    fraud_block = {"score": result["score"], "band": result["band"], "hard_stop": result["hard_stop"], "fired": fired,
                   "not_fired": result["not_fired"], "network_links": [], "narrative": inv.fraud_summary,
                   "extra_observations": [o.model_dump() for o in inv.extra_observations], "next_steps": inv.next_steps}
    auto = decision["auto"]
    net = financials["net_payable"]
    approved = net if auto else None
    dec = {"route": decision["route"], "recommended_action": decision["recommended_action"], "auto": auto,
           "confidence": 0.9 if not ctx.degraded else 0.6, "reasons": inv.decision_reasons[:4] or decision["reasons"],
           "policy_reasons": decision["reasons"], "policy_rule": decision["rule"], "reason_code": decision["reason_code"],
           "action": decision["action"], "conditions": inv.conditions if auto else [], "ai_summary": inv.ai_summary,
           "final_action": "approve" if auto else None, "decided_by": "agent:adjudication" if auto else None,
           "decided_at": iso(now) if auto else None, "approved_amount": approved,
           "info_request": {"items": items, "requested_at": iso(now)} if decision["status"] == "INFO_REQUESTED" else None}

    def update(claims: list[dict]) -> dict:
        c = next(x for x in claims if x["id"] == claim["id"])
        prev = c["status"]
        status = decision["status"]
        c["documents"], c["document_conditions"] = claim["documents"], claim["document_conditions"]
        c["checks"] = {**ver["checks"], "vehicle_identity": vehicle_identity.as_check(identity)}
        c["damage"], c["financials"], c["fraud"], c["decision"] = block, financials, fraud_block, dec
        c["vehicle_identity"] = identity
        if intake_out:
            c["intake"] = intake_out
            inc = c["incident"]
            if intake_out.get("translation_en"):
                inc["narrative_en"] = intake_out["translation_en"]
            if intake_out.get("language_codes"):
                inc["narrative_language"] = "-".join(intake_out["language_codes"][:2]) if len(intake_out["language_codes"]) > 1 \
                    else intake_out["language_codes"][0]
            if intake_out.get("parts_mentioned"):
                inc["damaged_parts_mentioned"] = intake_out["parts_mentioned"]
        if financials["total_loss_check"]["is_total_loss"] and c["claim_type"] not in ("Theft", "TP"):
            c["claim_type"] = "Total loss"
        c["risk_score"], c["risk_band"] = result["score"], result["band"]
        c["amount_claimed"] = float(c.get("garage_quote") or financials["assessed_loss"])
        c["amount_approved"] = float(approved or 0)
        c["status"], c["updated_at"] = status, iso(now)
        c["ai_processing_s"] = round(duration_ms / 1000)
        c["llm_mode"], c["ai_sources"] = ctx.mode, dict(ctx.sources)
        if not auto:
            c["assignee"] = c.get("assignee") or assignee
        sla_h = {"UNDER_REVIEW": 48, "INFO_REQUESTED": 72, "SIU_INVESTIGATION": 2160}.get(status)
        c["sla"] = {"target_hours": sla_h or 48, "due_at": iso(now + timedelta(hours=sla_h)) if sla_h else None, "breached": False}
        steps = [("agent:intake", "intake_complete", f"FNOL structured ({intake_out.get('language_label') or 'form'})"),
                 ("agent:document", "documents_read", f"{len((ctx.outputs.get('document') or {}).get('documents', []))} document(s) read"),
                 ("agent:verification", "checks_complete", f"DPI checks complete ({sum(1 for x in ver['checks'].values() if x['level'] == 'pass')} of {len(ver['checks'])} passed)"),
                 ("agent:damage", "damage_assessed", f"{len(block['items'])} damaged part(s) assessed · vehicle identity {identity['status'].replace('_', ' ')}"),
                 ("agent:fraud", "risk_scored", f"Risk score {result['score']} ({result['band']})"),
                 ("agent:adjudication", "recommendation", ACTION_TEXT[decision["action"]]),
                 ("agent:communication", "customer_notified", "Customer update sent")]
        for i, (actor, typ, text) in enumerate(steps):
            c["timeline"].append({"ts": iso(started + timedelta(milliseconds=(duration_ms * (i + 1)) // len(steps))), "actor": actor,
                                  "type": typ, "text": text})
        if status == "INFO_REQUESTED":
            c["timeline"].append({"ts": iso(now), "actor": "agent:communication", "type": "info_requested", "text": "Requested: " + ", ".join(items)})
        elif status == "SIU_INVESTIGATION":
            c["timeline"].append({"ts": iso(now), "actor": "agent:adjudication", "type": "siu_referral", "text": "Referred to SIU"})
        elif status in ("PREAUTH_ISSUED", "APPROVED"):
            c["timeline"].append({"ts": iso(now), "actor": "agent:adjudication", "type": status.lower(), "text": STATUS_TEXT[status]})
        else:
            c["timeline"].append({"ts": iso(now), "actor": "agent:adjudication", "type": "assigned", "text": "Assigned to claims handler"})
        c["audit"].append({"ts": iso(now), "actor": "agent:adjudication", "action": "status_change", "from": prev, "to": status,
                           "reason": f"{decision['rule']} {ACTION_TEXT[decision['action']]} · risk {result['score']} ({result['band']})"})
        if financials.get("llm_arithmetic_discrepancy"):
            d = financials["llm_arithmetic_discrepancy"]
            c["audit"].append({"ts": iso(now), "actor": "agent:damage", "action": "llm_arithmetic_discrepancy", "from": d["llm_total"],
                               "to": d["computed"], "reason": "LLM catalogue sum differs from Python; Python calculation used"})
        for a in ctx.degraded:
            c["audit"].append({"ts": iso(now), "actor": f"agent:{a}", "action": "agent_fallback", "from": None, "to": None,
                               "reason": "Automated step unavailable — conservative default used"})
        if comm and comm.get("message"):
            from .schemas import CommunicationOut
            c["communications"].append(communication.message_entry(c, CommunicationOut(**comm["message"]), draft=False,
                                                                   source=comm.get("source", "live")))
        Claim.model_validate(c)
        return c

    claims_now = await read_json("claims.json", [])
    assignee = await _assignee(claims_now)
    final = await update_json("claims.json", update, [])
    await _notify(final, decision)
    return final


async def _notify(claim: dict, decision: dict) -> None:
    users = await read_json("users.json", [])
    now = iso(now_ist())
    title = {"SIU": f"SIU referral: {claim['id']}", "handler": f"Needs review: {claim['id']}",
             "auto": f"Auto-processed: {claim['id']}"}[decision["route"]]

    def add(rows: list[dict]) -> None:
        n = max((int(r["id"].split("_")[1]) for r in rows if str(r.get("id", "")).startswith("n_") and r["id"].split("_")[1].isdigit()),
                default=-1)
        for admin in (u for u in users if u.get("role") == "admin"):
            n += 1
            rows.insert(0, {"id": f"n_{n:03d}", "user_id": admin["id"], "title": title,
                            "body": f"{claim['customer_name']} · {ACTION_TEXT[decision['action']]}", "href": f"/claims/{claim['id']}",
                            "created_at": now, "read": False})

    await update_json("notifications.json", add, [])


async def _fail_safe(claim_id: str, run_id: str, error: str) -> None:
    """The run crashed: never leave the claim stuck in PROCESSING."""
    now = iso(now_ist())

    def upd(claims: list[dict]) -> None:
        c = next((x for x in claims if x["id"] == claim_id), None)
        if c is None or c["status"] not in ("PROCESSING", "SUBMITTED"):
            return
        prev = c["status"]
        c["status"], c["updated_at"] = "UNDER_REVIEW", now
        c["decision"] = c.get("decision") or {"route": "handler", "recommended_action": "review", "auto": False, "confidence": 0,
                                              "reasons": ["Automated step unavailable"], "final_action": None, "decided_by": None,
                                              "decided_at": None, "approved_amount": None, "info_request": None}
        c["audit"].append({"ts": now, "actor": "system", "action": "status_change", "from": prev, "to": "UNDER_REVIEW",
                           "reason": f"Pipeline {run_id} failed — routed to handler ({error[:120]})"})

    try:
        await update_json("claims.json", upd, [])
    except Exception:  # noqa: BLE001
        log.exception("fail-safe update failed for %s", claim_id)
