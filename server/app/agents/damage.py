"""Agent 4 — Damage & vehicle identity (AGENT_PROMPTS.md E): ONE vision call for all photos. Gemini chooses part codes,
operations, severity, boxes and identity observations; Python validates the codes against this model's catalogue, prices every
line (costing.py) and decides vehicle identity (vehicle_identity.py)."""
from __future__ import annotations

from datetime import datetime

from ..services import costing, prompts, reference
from ..services.gemini import image_part
from . import media
from .base import RunContext, llm_step
from .schemas import DamageOut, PhotoIdentity, Story
from ..services.vehicle_identity import MODEL_BODY

REPAIR_PRICE_OPS = {"repair_minor_dent", "repair_moderate_dent", "plastic_repair"}
FRONT_IMPACT_CODES = {"FBMP", "BONT", "FNDR"}
METALLIC = ("Silver", "Grey", "Blue", "Brown", "Champagne")


def photos_of(claim: dict) -> list[tuple[dict, object]]:
    out = []
    for m in claim.get("media", []):
        if m["kind"] != "photo":
            continue
        path = media.local_path(claim["id"], m.get("url"), m.get("original_url"))
        if path is not None:
            out.append((m, path))
    return out


def age_months(vehicle: dict, incident_at: str) -> int:
    reg = vehicle.get("registered_on")
    if not reg:
        return 12
    return max(1, int((datetime.fromisoformat(incident_at).date() - datetime.fromisoformat(reg).date()).days / 30.4))


def catalogue(model_key: str) -> list[dict]:
    return [p for p in reference.load().parts.values() if p["model_key"] == model_key]


def variables(ctx: RunContext, intake: dict | None) -> dict:
    v, inc = ctx.vehicle, ctx.claim["incident"]
    ref = reference.load()
    rows = [{"code": p["part_code"], "part": p["part"], "material": p["material"], "replace": p["replace"], "repair": p.get("repair"),
             "painted": p["painted"]} for p in catalogue(v["model_key"])]
    ops = "; ".join(f"{k} {o['hours']}h" for k, o in ref.labour_operations["hours"].items())
    return {
        "vehicle_line": prompts.pipe_line([v["make"], v["model"], MODEL_BODY.get(v["model_key"]), v.get("colour"), v["registration"],
                                           age_months(v, inc["datetime"]), v["segment"]]),
        "narrative_en": prompts.customer_text((intake or {}).get("translation_en") or inc.get("narrative_en")),
        "incident_line": prompts.pipe_line([inc.get("label") or inc["type"], inc["datetime"][:16].replace("T", " "), inc["location"].get("text"),
                                            (intake or {}).get("counterparty") or ("third party" if inc.get("third_party_involved") else "none")]),
        "catalogue_rows": prompts.pipe_table(rows, ["code", "part", "material", "replace", "repair", "painted"]),
        "ops_rows": ops,
    }


def default(photo_ids: list[str]) -> DamageOut:
    return DamageOut(photos=[PhotoIdentity(photo_id=p) for p in photo_ids],
                     story=Story(consistent=True, why="Not assessed — automated step unavailable", confidence=0))


async def run(ctx: RunContext) -> dict:
    todo = photos_of(ctx.claim)
    if not todo:
        ctx.sources["damage"] = "python"
        await ctx.progress("damage", "No photos to assess")
        return {"photos": [], "items": [], "pre_existing": [], "uncatalogued": [], "no_photos": True,
                "story": {"consistent": True, "why": "No photos supplied", "confidence": 0}}
    contents = [image_part(path, f"{m['id']} | {m.get('slot') or 'photo'}") for m, path in todo]
    await ctx.progress("damage", f"Inspecting {len(todo)} photo(s) against the {ctx.vehicle['make']} {ctx.vehicle['model']} catalogue")
    out = await llm_step(ctx, agent="damage", prompt="damage", variables=variables(ctx, ctx.outputs.get("intake")), contents=contents,
                         schema=DamageOut, temperature=0.2, thinking="medium", default=lambda: default([m["id"] for m, _ in todo]),
                         max_output_tokens=16384)
    for it in out.items:
        await ctx.progress("damage", f"{it.part} · {it.damage_type} · {it.severity} → {it.operation.replace('_', ' ')}"
                           + ("" if it.fresh else " · older damage"), "pass" if it.fresh and it.confidence >= 0.75 else "warn")
    for pe in out.pre_existing:
        await ctx.progress("damage", f"Older damage: {pe.part} ({pe.confidence:.2f})", "warn")
    if not out.story.consistent:
        await ctx.progress("damage", "Damage pattern does not fully match the description", "warn")
    return out.model_dump(mode="json")


# ------------------------------------------------------------------------------------------------ apply (Python)

def _box(b: list | None) -> list[int] | None:
    if not b or len(b) != 4:
        return None
    vals = [max(0, min(1000, int(round(x)))) for x in b]
    return vals if vals[2] > vals[0] and vals[3] > vals[1] else None


def build_damage(out: dict, *, model_key: str, photo_ids: set[str]) -> tuple[dict, list[dict], bool, float]:
    """→ (claim.damage block, costing items, front_impact, python catalogue sum for the LLM cross-check)."""
    parts = reference.load().parts
    items, cost_items, uncatalogued = [], [], list(out.get("uncatalogued") or [])
    for it in out.get("items", []):
        code = it["code"]
        p = parts.get(code)
        if p is None or p["model_key"] != model_key:
            uncatalogued.append({"part": it["part"], "zone": it.get("zone"), "damage_type": it.get("damage_type"),
                                 "severity": it.get("severity"), "photo_ids": it.get("photo_ids", []),
                                 "note": f"Code {code} is not in the catalogue for this model — excluded from the estimate"})
            continue
        boxes = [{"photo_id": b["photo_id"], "box_2d": bb, "label": b.get("label") or f"{p['part']} · {it['damage_type']}"}
                 for b in it.get("boxes", []) if b.get("photo_id") in photo_ids and (bb := _box(b.get("box_2d")))]
        flag = "fail" if not it.get("fresh", True) else ("warn" if it["confidence"] < 0.75 else "pass")
        items.append({"part_code": code, "part": p["part"], "zone": p["zone"], "damage_type": it["damage_type"], "severity": it["severity"],
                      "operation": it["operation"], "fresh": it.get("fresh", True), "confidence": it["confidence"],
                      "photo_ids": [x for x in it.get("photo_ids", []) if x in photo_ids] or sorted({b["photo_id"] for b in boxes}),
                      "boxes": boxes, "flag": flag,
                      **({"flag_note": "Low confidence — needs human review"} if flag == "warn" else {}),
                      **({"flag_note": "Older damage — excluded from fresh-damage assessment"} if flag == "fail" else {})})
        cost_items.append({"part_code": code, "operation": it["operation"]})

    pre = []
    for pe in out.get("pre_existing", []):
        bb = _box(pe.get("box"))
        pid = pe.get("photo_id") if pe.get("photo_id") in photo_ids else None
        pre.append({"part": pe["part"], "part_code": pe.get("code"), "evidence": pe["evidence"], "confidence": pe["confidence"],
                    "photo_ids": [pid] if pid else [],
                    "boxes": [{"photo_id": pid, "box_2d": bb, "label": f"{pe['part']} · older damage"}] if pid and bb else []})

    suffixes = {i["part_code"].rsplit("-", 1)[-1] for i in items}
    front_impact = bool(out.get("wheel_alignment")) or bool(suffixes & FRONT_IMPACT_CODES)
    catalogue_sum = sum(parts[c["part_code"]]["replace"] if c["operation"] == "replace"
                        else (parts[c["part_code"]].get("repair") or 0) if c["operation"] in REPAIR_PRICE_OPS else 0 for c in cost_items)
    story = out.get("story") or {}
    photo_q = {p["photo_id"]: {"usable": p.get("usable", True), "issues": p.get("issues", [])} for p in out.get("photos", [])}
    block = {
        "items": items, "pre_existing": pre, "uncatalogued": uncatalogued,
        "narrative_consistency": {"consistent": story.get("consistent", True), "explanation": story.get("why", ""),
                                  "confidence": story.get("confidence", 0)},
        "photo_coverage": out.get("coverage") or {}, "photo_quality": photo_q, "suggested_photos": out.get("suggested_photos", []),
        "overall_severity": out.get("overall_severity") if out.get("overall_severity") in ("minor", "moderate", "severe") else "minor",
        "total_loss_indicator": out.get("total_loss_indicator", False), "total_loss_evidence": out.get("total_loss_evidence"),
        "notes": out.get("notes"), "assessed_by": "agent:damage",
    }
    return block, cost_items, front_impact, float(catalogue_sum)


def vehicle_context(ctx: RunContext) -> costing.VehicleContext:
    v, pol, claim = ctx.vehicle, ctx.policy, ctx.claim
    return costing.VehicleContext(
        segment=v["segment"], vehicle_type=v["type"], cc=v.get("cc") or 0, age_months=age_months(v, claim["incident"]["datetime"]),
        zero_dep=pol["add_ons"].get("zero_dep", False), consumables=pol["add_ons"].get("consumables", False),
        metallic=(v.get("colour") or "") in METALLIC, city_tier=ctx.city.get("tier", 1),
        garage_type=(ctx.garage or {}).get("type", "multibrand") if (ctx.garage or {}).get("type") in ("authorised", "multibrand") else "multibrand",
        idv=pol["idv"], voluntary_deductible=pol.get("voluntary_deductible", 0), apply_deductible=claim["claim_type"] != "TP",
        salvage_pct=0.20)


def price(ctx: RunContext, cost_items: list[dict], front_impact: bool, catalogue_sum: float, llm_estimate: float | None) -> dict:
    """Every rupee comes from costing.py. The LLM's own catalogue sum is only compared, and any disagreement is logged."""
    vctx = vehicle_context(ctx)
    quote = ctx.claim.get("garage_quote")
    if ctx.claim["claim_type"] == "Theft":
        fin = costing.theft_settlement(vctx)
    else:
        fin = costing.calculate_cost(cost_items, vctx, front_impact=front_impact, garage_quote=float(quote) if quote else None)
    if llm_estimate is not None and abs(llm_estimate - catalogue_sum) >= 1:
        fin["llm_arithmetic_discrepancy"] = {"llm_total": llm_estimate, "computed": catalogue_sum,
                                             "difference": round(llm_estimate - catalogue_sum, 2),
                                             "basis": "catalogue prices before depreciation and labour", "resolution": "Python calculation used"}
    fin["ncb_impact"] = {"current_pct": ctx.policy.get("ncb_pct", 0),
                         "after_claim_pct": 0 if ctx.claim["claim_type"] in ("OD", "Total loss") else ctx.policy.get("ncb_pct", 0)}
    return fin
