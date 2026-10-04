"""Agent 1 — Intake (AGENT_PROMPTS.md C). Skipped when the wizard already captured intake for this claim (`claim.intake`).

The wizard's structured fields (time, place, type) stay authoritative; Intake adds the language, a faithful English translation,
normalised part names, injuries/FIR/driver facts and follow-up questions. A large disagreement with the entered time is reported
as a warning, never silently applied."""
from __future__ import annotations

from datetime import datetime

from ..services import prompts
from ..services.claim_views import now_ist
from . import media
from .base import RunContext, llm_step
from .schemas import IntakeOut

TYPE_MAP = {"rear_end": "accident", "front_collision": "accident", "side_swipe": "accident", "parking_scrape": "accident",
            "pothole": "accident", "animal": "accident", "skid_fall": "accident", "glass": "glass", "flood": "flood", "theft": "theft",
            "fire": "fire", "vandalism": "vandalism"}


def policy_line(ctx: RunContext) -> str:
    p, v = ctx.policy, ctx.vehicle
    return prompts.pipe_line([p["policy_no"], p.get("product"), p["cover"], f"{v['make']} {v['model']}", v["registration"],
                              f"valid {p['start']} to {p['end']}"])


def default(ctx: RunContext) -> IntakeOut:
    inc = ctx.claim["incident"]
    return IntakeOut(language_codes=[inc.get("narrative_language") or "en"], language_label=inc.get("narrative_language") or "en",
                     translation_en=inc.get("narrative_en") or inc.get("narrative_original") or "",
                     incident_type=TYPE_MAP.get(inc["type"], "other"), incident_at=inc["datetime"], datetime_conf=1.0,
                     location_text=inc["location"].get("text"), city=inc["location"].get("city"), cause=inc.get("cause"),
                     third_party=bool(inc.get("third_party_involved")), injuries="minor" if inc.get("injuries") else "unknown",
                     parts_mentioned=inc.get("damaged_parts_mentioned") or [], needs_review=True)


async def run(ctx: RunContext) -> dict:
    claim = ctx.claim
    if claim.get("intake"):
        ctx.sources["intake"] = "skipped"
        await ctx.progress("intake", "Intake already captured in the wizard — reusing it")
        return claim["intake"]
    inc = claim["incident"]
    contents: list = ["The customer's statement is in the instructions above."]
    voice = next((m for m in claim.get("media", []) if m["kind"] == "audio"), None)
    if voice:
        path = media.local_path(claim["id"], voice.get("url"), voice.get("original_url"))
        if path is not None and path.stat().st_size < 15 * 1024 * 1024:
            from ..services.gemini import MediaPart
            contents.append(MediaPart(path.read_bytes(), media.AUDIO_MIME.get(path.suffix.lower(), "audio/webm"), f"{voice['id']} | voice_note"))
            await ctx.progress("intake", f"Voice note attached ({voice.get('duration_s') or '?'} s)")
    variables = {"now": now_ist().strftime("%Y-%m-%d %H:%M"), "channel": claim["channel"], "policy_line": policy_line(ctx),
                 "text": prompts.customer_text(inc.get("narrative_original") or inc.get("narrative_en"))}
    await ctx.progress("intake", "Reading the customer's statement")
    out = await llm_step(ctx, agent="intake", prompt="intake", variables=variables, contents=contents, schema=IntakeOut,
                         temperature=0.2, thinking="low", default=lambda: default(ctx), max_output_tokens=4096)
    result = out.model_dump(mode="json")
    if out.injection_suspected:
        await ctx.progress("intake", "Statement contains instructions to the insurer — ignored and flagged for review", "warn")
    if out.incident_at:
        try:
            gap_h = abs((datetime.fromisoformat(out.incident_at) - datetime.fromisoformat(inc["datetime"])).total_seconds()) / 3600
            if gap_h > 3 and out.datetime_conf >= 0.75:
                await ctx.progress("intake", f"Statement suggests a different time ({out.incident_at[:16]}) than the form", "warn")
        except ValueError:
            pass
    await ctx.progress("intake", f"Language: {out.language_label} · {len(out.parts_mentioned)} part(s) mentioned"
                       + (f" · missing: {', '.join(out.missing[:3])}" if out.missing else ""))
    return result
