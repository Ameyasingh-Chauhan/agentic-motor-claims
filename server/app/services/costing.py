"""Deterministic motor claim costing (spec §12.9). Every rupee in the product is computed here.

The LLM only selects part codes, operations and severity; this module prices them from the JSON rate cards
(`parts_catalog.json`, `labour_rates.json`, `labour_operations.json`, `paint_rates.json`,
`depreciation_rules.json`, `deductibles.json`). Exact values are kept in JSON; `display_rupees()` rounds to
the nearest ₹10 for display.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from . import reference

REPAIR_OPS = {"repair_minor_dent", "repair_moderate_dent", "plastic_repair"}
OPERATIONS = {"replace", "refit_only", "paint_only"} | REPAIR_OPS


@dataclass(frozen=True)
class VehicleContext:
    segment: str                      # e.g. CAR_COMPACT_SUV_SEDAN
    vehicle_type: str = "Car"         # Car | 2W | CV
    cc: int = 1197
    age_months: int = 12
    zero_dep: bool = False
    consumables: bool = False
    metallic: bool = False
    city_tier: int = 1
    garage_type: str = "authorised"   # authorised | multibrand
    idv: float = 0
    voluntary_deductible: float = 0
    salvage_pct: float = 0.20         # 15–25% of IDV, by condition (total loss only)
    apply_deductible: bool = True     # False for TP claims (§12.8)


def display_rupees(value: float) -> int:
    """Round half-up to the nearest ₹10 (§12.9 display rule)."""
    return int(math.floor(value / 10 + 0.5) * 10)


def depreciation_pct(material: str, age_months: int, zero_dep: bool = False, ref: reference.Reference | None = None) -> float:
    if zero_dep:
        return 0.0
    rules = (ref or reference.load()).depreciation
    by_material = rules.get("material_pct", {})
    if material in by_material:
        return by_material[material] / 100
    for slab in rules.get("metal_by_age_months", []):
        if slab["max_months"] is None or age_months <= slab["max_months"]:
            return slab["pct"] / 100
    return 0.5


def compulsory_deductible(vehicle_type: str, cc: int = 0, ref: reference.Reference | None = None) -> int:
    table = (ref or reference.load()).deductibles.get("compulsory", {})
    if vehicle_type == "2W":
        return table.get("2W", 100)
    if vehicle_type == "CV":
        return table.get("CV", 500)
    return table.get("car_above_1500cc", 2000) if cc > 1500 else table.get("car_upto_1500cc", 1000)


def labour_rate(ctx: VehicleContext, ref: reference.Reference | None = None) -> float:
    ref = ref or reference.load()
    lr = ref.labour_rates
    base = lr["car_rates"][f"tier{ctx.city_tier}"][ctx.garage_type]
    return base * lr["vehicle_type_multiplier"].get(ctx.vehicle_type, 1.0)


def op_hours(op_key: str, vehicle_type: str, ref: reference.Reference | None = None) -> float:
    lo = (ref or reference.load()).labour_operations
    hours = lo["hours"].get(op_key, {}).get("hours", 0.0)
    return hours * lo["vehicle_type_multiplier"].get(vehicle_type, 1.0)


def paint_rate(ctx: VehicleContext, ref: reference.Reference | None = None) -> float:
    entry = (ref or reference.load()).paint_rates["per_panel"][ctx.segment]
    return entry["rate"] * (1 + (entry["metallic_surcharge"] if ctx.metallic else 0))


def calculate_cost(items: list[dict], ctx: VehicleContext, *, front_impact: bool = False,
                   garage_quote: float | None = None, llm_total: float | None = None,
                   ref: reference.Reference | None = None) -> dict:
    """Price damage items. Each item: {part_code, operation, blend?}. Returns the §11.2 `financials` block."""
    ref = ref or reference.load()
    rate = labour_rate(ctx, ref)
    pr = ref.paint_rates
    paint_dep_share = pr["material_share"] * pr["material_depreciation"]  # 0.25 × 0.50 = 12.5%
    replaced = {i["part_code"] for i in items if i.get("operation") == "replace"}

    lines = []
    for item in items:
        code, op = item["part_code"], item.get("operation", "replace")
        if op not in OPERATIONS:
            raise ValueError(f"Unknown operation {op!r} for {code}")
        part = ref.parts.get(code)
        if part is None:
            raise KeyError(f"Part {code} is not in parts_catalog.json")

        price = dep_pct = 0.0
        hours = 0.0
        labour = 0.0
        if op == "replace":
            price = float(part["replace"])
            dep_pct = depreciation_pct(part["material"], ctx.age_months, ctx.zero_dep, ref)
            via = part.get("rr_accessed_via") or []
            hours = 0.0 if any(v in replaced for v in via) else op_hours(part["rr_operation"], ctx.vehicle_type, ref)
            labour = hours * rate
        elif op in REPAIR_OPS:
            if part.get("repair"):
                labour = float(part["repair"])
            else:
                hours = op_hours(op, ctx.vehicle_type, ref)
                labour = hours * rate
        elif op == "refit_only":
            hours = op_hours(part["rr_operation"], ctx.vehicle_type, ref)
            labour = hours * rate

        dep_amount = price * dep_pct
        paint = paint_rate(ctx, ref) * (1 + (pr["blend_pct"] if item.get("blend") and op in REPAIR_OPS else 0)) if part["painted"] else 0.0
        paint_dep = 0.0 if ctx.zero_dep else paint * paint_dep_share
        line_total = (price - dep_amount) + labour + (paint - paint_dep)
        lines.append({
            "part_code": code, "description": part["part"], "zone": part["zone"], "operation": op,
            "material": part["material"], "base_price": price, "dep_pct": round(dep_pct * 100, 2),
            "dep_amount": dep_amount, "net_parts": price - dep_amount, "labour_hours": round(hours, 3),
            "labour_rate": rate, "labour": labour, "paint": paint, "paint_material_dep": paint_dep,
            "line_total": line_total,
        })

    extras = []
    if ctx.consumables:
        amount = ref.depreciation["consumables_line"].get(ctx.vehicle_type, 600)
        extras.append({"description": "Consumables (add-on)", "amount": float(amount)})
    if front_impact and ctx.vehicle_type != "2W":
        extras.append({"description": "Wheel alignment & balancing", "amount": op_hours("wheel_alignment", ctx.vehicle_type, ref) * rate})

    gross_parts = sum(line["base_price"] for line in lines)
    parts_dep = sum(line["dep_amount"] for line in lines)
    paint_gross = sum(line["paint"] for line in lines)
    paint_dep = sum(line["paint_material_dep"] for line in lines)
    assessed = sum(line["line_total"] for line in lines) + sum(e["amount"] for e in extras)

    threshold = ref.deductibles.get("total_loss_threshold_pct", 75)
    is_total_loss = bool(ctx.idv) and assessed > ctx.idv * threshold / 100
    comp = compulsory_deductible(ctx.vehicle_type, ctx.cc, ref) if ctx.apply_deductible else 0
    vol = ctx.voluntary_deductible if ctx.apply_deductible else 0
    salvage = ctx.idv * ctx.salvage_pct if is_total_loss else 0.0
    if is_total_loss:
        net_payable = max(0.0, ctx.idv - salvage - comp - vol)
    else:
        net_payable = max(0.0, assessed - comp - vol)

    variance_pct = variance_level = None
    if garage_quote is not None and assessed:
        variance_pct = round((garage_quote - assessed) / assessed * 100, 1)
        variance_level = "pass" if variance_pct <= 15 else ("warn" if variance_pct <= 30 else "fail")

    discrepancy = None
    if llm_total is not None and abs(llm_total - net_payable) >= 1:
        discrepancy = {"llm_total": llm_total, "computed": net_payable, "difference": round(llm_total - net_payable, 2),
                       "resolution": "Python calculation used"}

    return {
        "currency": "INR", "vehicle_age_months": ctx.age_months, "zero_dep": ctx.zero_dep,
        "labour_rate": rate, "lines": lines, "extras": extras,
        "gross_parts": gross_parts, "total_depreciation": parts_dep + paint_dep,
        "net_parts": gross_parts - parts_dep, "labour": sum(line["labour"] for line in lines),
        "paint_gross": paint_gross, "paint_dep": paint_dep, "assessed_loss": assessed,
        "compulsory_deductible": comp, "voluntary_deductible": vol, "salvage": salvage,
        "net_payable": net_payable, "display_net_payable": display_rupees(net_payable),
        "garage_quote": garage_quote, "variance_pct": variance_pct, "variance_level": variance_level,
        "total_loss_check": {"idv": ctx.idv, "threshold_pct": threshold, "is_total_loss": is_total_loss},
        "llm_arithmetic_discrepancy": discrepancy,
    }


def theft_settlement(ctx: VehicleContext, *, ref: reference.Reference | None = None) -> dict:
    """Total theft: payable = IDV − compulsory − voluntary deductible (no parts, no salvage)."""
    ref = ref or reference.load()
    comp = compulsory_deductible(ctx.vehicle_type, ctx.cc, ref)
    net_payable = max(0.0, ctx.idv - comp - ctx.voluntary_deductible)
    return {
        "currency": "INR", "vehicle_age_months": ctx.age_months, "zero_dep": ctx.zero_dep, "labour_rate": 0,
        "lines": [], "extras": [], "gross_parts": 0.0, "total_depreciation": 0.0, "net_parts": 0.0, "labour": 0.0,
        "paint_gross": 0.0, "paint_dep": 0.0, "assessed_loss": float(ctx.idv),
        "compulsory_deductible": comp, "voluntary_deductible": ctx.voluntary_deductible, "salvage": 0.0,
        "net_payable": net_payable, "display_net_payable": display_rupees(net_payable),
        "garage_quote": None, "variance_pct": None, "variance_level": None,
        "total_loss_check": {"idv": ctx.idv, "threshold_pct": 100, "is_total_loss": True},
        "llm_arithmetic_discrepancy": None,
    }


WORKED_EXAMPLE_ITEMS = [
    {"part_code": "HYU-CRE-FBMP", "operation": "replace"},
    {"part_code": "HYU-CRE-HLED", "operation": "replace"},
    {"part_code": "HYU-CRE-BMRF", "operation": "replace"},
]
WORKED_EXAMPLE_CONTEXT = VehicleContext(segment="CAR_COMPACT_SUV_SEDAN", vehicle_type="Car", cc=1497, age_months=28,
                                        city_tier=1, garage_type="authorised", idv=1_240_000)


def worked_example(ref: reference.Reference | None = None) -> dict:
    """§12.9 calibration: Creta, 28 months, Pune authorised workshop → ₹24,129.5 (displayed ₹24,130).

    Always runs the real calculation so a change to the rate cards or algorithm shows up here.
    """
    return calculate_cost(WORKED_EXAMPLE_ITEMS, WORKED_EXAMPLE_CONTEXT, front_impact=True, ref=ref)
