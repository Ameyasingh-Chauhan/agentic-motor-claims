"""Dev Tools (spec §10.11, §17) — developer only: LLM mode switch, Vertex connection test, pipeline run inspector, forced agent
failures (resilience demo), re-running the pipeline on a claim and Demo-mode scenario replays."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..agents import orchestrator
from ..config import get_settings
from ..services import gemini, pipeline_bus, scenario_replay
from ..services.json_store import read_json, update_json
from .auth import current_user

router = APIRouter(prefix="/api/dev", tags=["dev"])
RUNTIME = "runtime_settings.json"


def developer(user=Depends(current_user)) -> dict:
    if not user.get("is_developer"):
        raise HTTPException(403, {"code": "forbidden", "message": "You don't have access"})
    return user


class ModeBody(BaseModel):
    mode: str


class FailureBody(BaseModel):
    agent: str
    on: bool = True


class RerunBody(BaseModel):
    pace: str = "presentation"


def llm_state() -> dict:
    s = get_settings()
    return {"configured": gemini.configured_mode(), "effective": gemini.effective_mode(), "env_default": s.llm_mode,
            "credentials_present": s.credentials_present, "model": s.gemini_model, "location": s.google_cloud_location,
            "forced_failures": gemini.forced_failures()}


async def load_runtime_settings() -> None:
    """Startup: re-apply the Dev Tools LLM mode chosen before a restart."""
    saved = await read_json(RUNTIME, {}) or {}
    gemini.set_mode_override(saved.get("llm_mode"))


@router.get("/llm-mode")
async def get_llm_mode(_=Depends(developer)):
    return llm_state()


@router.post("/llm-mode")
async def set_llm_mode(body: ModeBody, _=Depends(developer)):
    if body.mode not in ("auto", "live", "demo"):
        raise HTTPException(422, {"code": "validation", "fields": {"mode": "Use auto, live or demo"}})
    gemini.set_mode_override(body.mode)

    def save(v: dict) -> None:
        v["llm_mode"] = body.mode

    await update_json(RUNTIME, save, {})
    return llm_state()


@router.post("/health/vertex")
async def vertex_health(_=Depends(developer)):
    return await gemini.test_connection()


@router.post("/force-failure")
async def force_failure(body: FailureBody, _=Depends(developer)):
    if body.agent not in ("intake", "document", "damage", "investigation", "communication"):
        raise HTTPException(422, {"code": "validation", "fields": {"agent": "Unknown agent"}})
    gemini.force_failure(body.agent, body.on)
    return llm_state()


@router.get("/runs")
async def list_runs(_=Depends(developer)):
    runs = await read_json(pipeline_bus.FILE, [])
    return [{k: r.get(k) for k in ("id", "claim_id", "status", "mode", "pace", "trigger", "started_at", "duration_ms", "totals", "result")}
            for r in reversed(runs)]


@router.get("/runs/{run_id}")
async def get_run(run_id: str, _=Depends(developer)):
    run = await pipeline_bus.get_run(run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    return run


@router.post("/claims/{claim_id}/rerun")
async def rerun(claim_id: str, body: RerunBody, _=Depends(developer)):
    claims = await read_json("claims.json", [])
    claim = next((c for c in claims if c["id"] == claim_id), None)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    if claim.get("origin") != "app":
        raise HTTPException(409, {"code": "seeded", "message": "Seeded claims are illustrative history and are not re-processed"})
    if claim["status"] == "DRAFT":
        raise HTTPException(409, {"code": "draft", "message": "Submit the claim first"})
    run_id = await orchestrator.start(claim_id, pace=body.pace if body.pace in ("presentation", "fast") else "presentation", trigger="rerun")
    return {"run_id": run_id, "claim_id": claim_id}


@router.post("/scenarios/{scenario_id}/replay")
async def replay(scenario_id: str, body: RerunBody, user=Depends(developer)):
    try:
        claim = await scenario_replay.clone(scenario_id, user)
    except KeyError:
        raise HTTPException(404, "Unknown scenario")
    run_id = await orchestrator.start(claim["id"], pace=body.pace if body.pace in ("presentation", "fast") else "presentation",
                                      trigger=f"scenario_replay:{scenario_id}", force_mode="demo")
    return {"run_id": run_id, "claim_id": claim["id"]}
