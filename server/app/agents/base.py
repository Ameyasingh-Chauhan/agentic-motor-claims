"""Common agent framework (spec §15.1, AGENT_PROMPTS.md A1–A3).

`RunContext` carries the claim snapshot, this claim's reference records, previous agent outputs, the run's event emitter and
the LLM mode. `llm_step` is the single path to Gemini for every agent: render the prompt → structured call (retries + schema
retry inside gemini.py) → on failure, or in demo mode, the scenario's `demo_fallback/` output or a conservative default.
Every call (prompt, raw response, tokens, latency) is stored on the run for the Dev Tools inspector.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

from pydantic import BaseModel

from ..services import gemini, pipeline_bus, prompts
from ..services.json_store import read_json

AGENTS = [  # Theatre order: (name, display name, stage)
    ("intake", "Intake", 1), ("document", "Document", 2), ("verification", "Verification & DPI", 2),
    ("damage", "Damage & vehicle identity", 2), ("fraud", "Fraud", 3), ("adjudication", "Adjudication", 4),
    ("communication", "Communication", 5),
]
DISPLAY = {a: d for a, d, _ in AGENTS}
STAGE = {a: s for a, _, s in AGENTS}


@dataclass
class RunContext:
    run_id: str
    claim: dict
    policy: dict
    vehicle: dict
    customer: dict
    garage: dict | None
    city: dict
    mode: str                         # live | demo  (auto counts as live; failures fall back per step)
    pace_ms: int = 0
    outputs: dict[str, Any] = field(default_factory=dict)
    sources: dict[str, str] = field(default_factory=dict)   # agent → live | demo | fallback | python | skipped
    degraded: list[str] = field(default_factory=list)       # agents whose output is a conservative default
    llm_ms: int = 0

    @property
    def scenario_id(self) -> str | None:
        return self.claim.get("scenario_id")

    async def emit(self, event: str, **data) -> None:
        await pipeline_bus.emit(self.run_id, event, data)

    async def progress(self, agent: str, message: str, level: str = "info") -> None:
        await self.emit("agent_progress", agent=agent, message=message, level=level)


async def demo_output(scenario_id: str | None, agent: str, schema: type[BaseModel]) -> BaseModel | None:
    """`data/demo_fallback/<scenario>/<agent>.json`, validated; None when there is no file for this scenario."""
    if not scenario_id:
        return None
    raw = await read_json(f"demo_fallback/{scenario_id}/{agent}.json", None)
    return schema.model_validate(raw) if raw is not None else None


async def llm_step(ctx: RunContext, *, agent: str, prompt: str, variables: dict, contents: list, schema: type[BaseModel],
                   temperature: float, thinking: str | None, default: Callable[[], BaseModel], max_output_tokens: int = 8192,
                   call_name: str | None = None) -> BaseModel:
    """Returns the validated output. Sets ctx.sources[agent]; adds the agent to ctx.degraded when a conservative default is used."""
    system = prompts.render(prompt, variables)
    name = call_name or agent

    async def fallback(reason: str) -> BaseModel:
        canned = await demo_output(ctx.scenario_id, name, schema)
        if canned is not None:
            ctx.sources[agent] = "demo" if ctx.mode == "demo" else "fallback"
            if ctx.mode != "demo":
                await ctx.emit("agent_fallback", agent=agent, reason=f"{reason} — using the recorded scenario output")
            return canned
        ctx.sources[agent] = "fallback"
        if agent not in ctx.degraded:
            ctx.degraded.append(agent)
        await ctx.emit("agent_fallback", agent=agent, reason=f"{reason} — conservative default, routed for human review")
        return default()

    if ctx.mode == "demo":
        out = await fallback("Demo mode — AI responses are pre-recorded")
        await pipeline_bus.add_call(ctx.run_id, {"agent": name, "model": "demo", "prompt": system, "attempts": [], "media": [],
                                                 "input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "total_tokens": 0,
                                                 "latency_ms": 0, "ok": True, "source": ctx.sources[agent],
                                                 "output": out.model_dump(mode="json")})
        return out

    async def on_retry(attempt: int, reason: str) -> None:
        await ctx.emit("agent_retry", agent=agent, attempt=attempt, reason=reason)

    t0 = time.perf_counter()
    try:
        out, rec = await gemini.generate(agent=name, system=system, contents=contents, schema=schema, temperature=temperature,
                                         thinking=thinking, max_output_tokens=max_output_tokens, on_retry=on_retry)
        ctx.sources[agent] = "live"
        call = rec.as_dict() | {"source": "live", "output": out.model_dump(mode="json")}
    except gemini.GeminiError as exc:
        rec = getattr(exc, "record", None)
        out = await fallback(f"AI step failed after retries ({exc.kind})")
        call = (rec.as_dict() if rec else {"agent": name, "prompt": system}) | {"source": ctx.sources[agent], "error": str(exc),
                                                                              "output": out.model_dump(mode="json")}
    ctx.llm_ms += int((time.perf_counter() - t0) * 1000)
    await pipeline_bus.add_call(ctx.run_id, call)
    return out
