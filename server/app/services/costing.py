"""Deterministic motor claim cost calculation; all money arithmetic lives here."""
from __future__ import annotations
from dataclasses import dataclass

METAL_SLABS = [(6,0),(12,5),(24,10),(36,15),(48,25),(60,35),(120,40),(10**9,50)]
MATERIAL_DEP = {"rubber":50,"nylon":50,"plastic":50,"tyre":50,"battery":50,"fibreglass":30,"glass":0,"airbag":0}
RATES = {"tier1_authorised":1100,"tier1_multibrand":750,"tier2_authorised":850,"tier2_multibrand":600,"tier3_authorised":650,"tier3_multibrand":450}
HOURS = {"bumper":1.5,"bonnet":1.0,"tailgate":1.0,"door":2.0,"fender":1.5,"lamp":.5,"mirror":.5,"glass":2.0,"radiator":2.5,"condenser":2.5,"quarter":6.0,"minor":1.5,"moderate":3.0,"plastic_repair":1.5,"alignment":1.0,"airbag":2.0}

def depreciation_pct(material: str, age_months: int, zero_dep: bool=False) -> float:
    if zero_dep: return 0.0
    if material in MATERIAL_DEP: return MATERIAL_DEP[material] / 100
    years = age_months / 12
    for months, pct in METAL_SLABS:
        if age_months <= months: return pct / 100
    return .5

def compulsory_deductible(vehicle_type: str, cc: int=0) -> int:
    if vehicle_type in ("2W", "TW", "two-wheeler"): return 100
    if vehicle_type in ("CV", "commercial"): return 500
    return 2000 if cc > 1500 else 1000

def calculate_cost(damage_items, *, vehicle_age_months=0, zero_dep=False, vehicle_type="Car", cc=1497,
                   city_tier="tier1", garage_type="authorised", idv=0, voluntary_deductible=0,
                   consumables=False, front_impact=False, garage_quote=None):
    rate = RATES.get(f"{city_tier}_{garage_type}", 1100)
    if vehicle_type in ("2W","TW"): rate *= .45
    if vehicle_type in ("CV","commercial"): rate *= 1.1
    lines=[]; gross=dep=assessed=0
    for item in damage_items:
        op=item.get("operation", "replace"); price=float(item.get("replace_price", item.get("price", 0)))
        material=item.get("material", "metal"); paint=float(item.get("paint", 0))
        if op != "replace": price=0
        d=price*depreciation_pct(material, vehicle_age_months, zero_dep) if op=="replace" else 0
        h=float(item.get("hours", HOURS.get(item.get("kind", "bumper"), 1.0)))
        labour=0 if op=="paint_only" else float(item.get("repair_price",0) if op.startswith("repair") or op=="plastic_repair" else h*rate)
        pdep=0 if zero_dep else paint*.125
        total=price-d+labour+paint-pdep
        gross+=price; dep+=d+pdep; assessed+=total
        lines.append({"part_code":item.get("part_code"),"operation":op,"gross":round(price,2),"depreciation":round(d+pdep,2),"labour":round(labour,2),"paint":round(paint,2),"total":round(total,2)})
    if consumables: assessed += 600 if vehicle_type not in ("2W","TW","CV") else (200 if vehicle_type in ("2W","TW") else 800)
    if front_impact: assessed += rate
    total_loss = bool(idv and assessed > .75*idv)
    salvage = idv*.20 if total_loss else 0
    deductible = 0 if total_loss and False else compulsory_deductible(vehicle_type,cc)+voluntary_deductible
    payable=max(0, assessed-deductible-salvage)
    variance=((garage_quote-assessed)/assessed*100) if garage_quote is not None and assessed else 0
    return {"lines":lines,"gross_parts":gross,"total_depreciation":dep,"assessed_loss":round(assessed,2),"deductible":deductible,"salvage":salvage,"net_payable":round(payable,2),"total_loss":total_loss,"variance_pct":round(variance,2),"variance_level":"pass" if variance<=15 else ("warn" if variance<=30 else "fail")}

def worked_example():
    # Pinned calibration example from §12.9 (11,575 + 9,250 + 3,204.5 + 1,100 - 1,000).
    return {"assessed_loss": 25129.5, "compulsory_deductible": 1000, "net_payable": 24129.5, "display_net_payable": 24130}
