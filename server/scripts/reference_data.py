"""Reference rate cards and catalogues (spec §11.1, §12, §13).

Plain data plus small builders. `seed.py` writes these to `server/data/*.json`; at runtime the server and
`costing.py` read only the JSON files, so ABC's real rate cards can replace them without code changes.
"""
from __future__ import annotations

import random

# --- §12.1 Vehicle segments and models ---------------------------------------------------------

SEGMENTS = {
    "CAR_ENTRY": {"type": "Car", "factor": 0.70, "label": "Entry hatchback"},
    "CAR_PREMIUM_HATCH": {"type": "Car", "factor": 1.00, "label": "Premium hatch / compact sedan"},
    "CAR_COMPACT_SUV_SEDAN": {"type": "Car", "factor": 1.45, "label": "Compact SUV / sedan"},
    "CAR_MID_SUV_MPV": {"type": "Car", "factor": 1.85, "label": "Mid-size SUV / MPV"},
    "TW_COMMUTER": {"type": "2W", "factor": 1.00, "label": "Commuter two-wheeler"},
    "TW_PREMIUM": {"type": "2W", "factor": 1.90, "label": "Premium two-wheeler"},
    "CV_LCV": {"type": "CV", "factor": 1.00, "label": "Light commercial vehicle"},
}

# (make, model, code prefix, segment, cc, fuel, ex-showroom ₹ for IDV)
MODELS = [
    ("Maruti Suzuki", "Alto K10", "MAR-ALT", "CAR_ENTRY", 998, "Petrol", 420_000),
    ("Maruti Suzuki", "Wagon R", "MAR-WAG", "CAR_ENTRY", 1197, "Petrol", 560_000),
    ("Renault", "Kwid", "REN-KWD", "CAR_ENTRY", 999, "Petrol", 470_000),
    ("Maruti Suzuki", "Swift", "MAR-SWI", "CAR_PREMIUM_HATCH", 1197, "Petrol", 690_000),
    ("Maruti Suzuki", "Baleno", "MAR-BAL", "CAR_PREMIUM_HATCH", 1197, "Petrol", 760_000),
    ("Maruti Suzuki", "Dzire", "MAR-DZI", "CAR_PREMIUM_HATCH", 1197, "CNG", 740_000),
    ("Hyundai", "i20", "HYU-I20", "CAR_PREMIUM_HATCH", 1197, "Petrol", 820_000),
    ("Tata", "Punch", "TAT-PUN", "CAR_PREMIUM_HATCH", 1199, "Petrol", 680_000),
    ("Tata", "Altroz", "TAT-ALT", "CAR_PREMIUM_HATCH", 1199, "Diesel", 790_000),
    ("Hyundai", "Creta", "HYU-CRE", "CAR_COMPACT_SUV_SEDAN", 1497, "Petrol", 1_420_000),
    ("Hyundai", "Venue", "HYU-VEN", "CAR_COMPACT_SUV_SEDAN", 1197, "Petrol", 1_020_000),
    ("Tata", "Nexon", "TAT-NEX", "CAR_COMPACT_SUV_SEDAN", 1199, "Petrol", 1_050_000),
    ("Maruti Suzuki", "Brezza", "MAR-BRZ", "CAR_COMPACT_SUV_SEDAN", 1462, "Petrol", 1_080_000),
    ("Kia", "Seltos", "KIA-SEL", "CAR_COMPACT_SUV_SEDAN", 1497, "Diesel", 1_520_000),
    ("Honda", "City", "HON-CIT", "CAR_COMPACT_SUV_SEDAN", 1498, "Petrol", 1_350_000),
    ("Mahindra", "XUV700", "MAH-XUV", "CAR_MID_SUV_MPV", 2184, "Diesel", 2_100_000),
    ("Mahindra", "Scorpio-N", "MAH-SCN", "CAR_MID_SUV_MPV", 2184, "Diesel", 1_850_000),
    ("Toyota", "Innova Hycross", "TOY-INH", "CAR_MID_SUV_MPV", 1987, "Hybrid", 2_550_000),
    ("Kia", "Carens", "KIA-CAR", "CAR_MID_SUV_MPV", 1497, "Petrol", 1_400_000),
    ("Honda", "Activa", "HON-ACT", "TW_COMMUTER", 110, "Petrol", 82_000),
    ("Hero", "Splendor+", "HER-SPL", "TW_COMMUTER", 97, "Petrol", 78_000),
    ("Honda", "Shine", "HON-SHI", "TW_COMMUTER", 124, "Petrol", 86_000),
    ("TVS", "Jupiter", "TVS-JUP", "TW_COMMUTER", 110, "Petrol", 80_000),
    ("Bajaj", "Pulsar NS200", "BAJ-PNS", "TW_PREMIUM", 199, "Petrol", 155_000),
    ("Royal Enfield", "Classic 350", "ROY-CLA", "TW_PREMIUM", 349, "Petrol", 215_000),
    ("TVS", "Apache RTR 160", "TVS-APA", "TW_PREMIUM", 160, "Petrol", 128_000),
    ("Tata", "Ace Gold", "TAT-ACE", "CV_LCV", 694, "Diesel", 560_000),
    ("Ashok Leyland", "Dost+", "ASH-DOS", "CV_LCV", 1478, "Diesel", 820_000),
    ("Mahindra", "Bolero Pik-Up", "MAH-BPU", "CV_LCV", 2523, "Diesel", 950_000),
]

# Pinned OEM prices (§12.1) — override the formula; the worked example and demo scenarios depend on them.
PINNED_PRICES = {
    "HYU-CRE-FBMP": 12_500,
    "HYU-CRE-RBMP": 11_200,
    "HYU-CRE-HLED": 17_400,
    "HYU-CRE-BMRF": 3_770,
    "HYU-CRE-TLGT": 17_500,
    "HYU-CRE-TLMP": 7_200,
}

# --- §12.2–12.4 Base part prices -----------------------------------------------------------------
# code: (part, material, replace, repair|None, painted, zone, R&R operation key, accessed_via)
# `accessed_via`: R&R hours are 0 when one of these parts is replaced in the same claim (§12.9).

CAR_PARTS = {
    "FBMP": ("Front bumper", "plastic", 5900, 2200, True, "front", "rr_bumper", None),
    "RBMP": ("Rear bumper", "plastic", 5600, 2200, True, "rear", "rr_bumper", None),
    "BMRF": ("Bumper reinforcement / bracket", "metal", 2600, 1200, False, "front", "rr_bumper", ["FBMP", "RBMP"]),
    "BONT": ("Bonnet", "metal", 9800, 3200, True, "front", "rr_bonnet", None),
    "FNDR": ("Front fender", "metal", 4200, 2000, True, "left", "rr_fender", None),
    "FDOR": ("Front door shell", "metal", 12500, 3800, True, "right", "rr_door", None),
    "RDOR": ("Rear door shell", "metal", 11800, 3600, True, "left", "rr_door", None),
    "TLGT": ("Tailgate / boot lid", "metal", 11000, 3600, True, "rear", "rr_bonnet", None),
    "QPNL": ("Quarter panel", "metal", 9500, 4200, True, "rear", "replace_quarter", None),
    "ROOF": ("Roof panel", "metal", 14000, 4500, True, "top", "replace_roof", None),
    "GRIL": ("Front grille", "plastic", 2400, None, False, "front", "rr_trim", ["FBMP"]),
    "HLMP": ("Headlamp assembly – halogen", "plastic", 6500, None, False, "front", "replace_lamp", None),
    "HLED": ("Headlamp assembly – LED", "plastic", 12000, None, False, "front", "replace_lamp", None),
    "TLMP": ("Tail lamp", "plastic", 3200, None, False, "rear", "replace_lamp", None),
    "FOGL": ("Fog lamp", "plastic", 1600, None, False, "front", "replace_lamp", None),
    "ORVM": ("Outside mirror, electric", "plastic", 3800, None, False, "right", "replace_mirror", None),
    "WSCR": ("Windshield (laminated)", "glass", 8500, None, False, "glass", "replace_windshield", None),
    "RGLS": ("Rear glass", "glass", 6200, None, False, "glass", "replace_windshield", None),
    "DGLS": ("Door glass", "glass", 2800, None, False, "glass", "replace_door_glass", None),
    "RADI": ("Radiator", "metal", 7500, None, False, "front", "replace_radiator", None),
    "CNDS": ("AC condenser", "metal", 6800, None, False, "front", "replace_radiator", None),
    "ALWH": ("Alloy wheel", "metal", 7500, 1500, False, "wheel", "replace_wheel", None),
    "TYRE": ("Tyre", "rubber", 5200, None, False, "wheel", "replace_wheel", None),
    "AIRB": ("Airbag module", "airbag", 18000, None, False, "interior", "airbag", None),
    "BATT": ("Battery", "battery", 5500, None, False, "front", "replace_battery", None),
    "FBRP": ("Fibreglass spoiler / garnish", "fibreglass", 3500, None, True, "rear", "rr_trim", None),
}

TW_PARTS = {
    "FPNL": ("Front panel / visor / fairing", "plastic", 1450, None, True, "front", "rr_bumper", None),
    "SPNL": ("Side panel", "plastic", 1100, None, True, "left", "rr_fender", None),
    "FMDG": ("Front mudguard", "plastic", 900, None, True, "front", "rr_fender", None),
    "HLMP": ("Headlamp assembly", "plastic", 1200, None, False, "front", "replace_lamp", None),
    "TLMP": ("Tail lamp", "plastic", 650, None, False, "rear", "replace_lamp", None),
    "INDC": ("Indicator", "plastic", 220, None, False, "front", "replace_lamp", None),
    "MIRR": ("Mirror", "plastic", 250, None, False, "right", "replace_mirror", None),
    "HBAR": ("Handlebar", "metal", 750, 300, False, "front", "rr_door", None),
    "CGRD": ("Crash guard", "metal", 1100, 350, False, "left", "rr_fender", None),
    "BLVR": ("Brake/clutch lever", "metal", 180, None, False, "front", "replace_mirror", None),
    "FTNK": ("Fuel tank", "metal", 4800, 1200, True, "top", "rr_door", None),
    "SLNC": ("Silencer", "metal", 3200, 800, False, "right", "rr_fender", None),
    "WRIM": ("Wheel rim", "metal", 2200, 600, False, "wheel", "replace_wheel", None),
    "FORK": ("Front fork assembly", "metal", 3600, None, False, "front", "replace_radiator", None),
    "TYRE": ("Tyre", "rubber", 1800, None, False, "wheel", "replace_wheel", None),
    "SEAT": ("Seat", "rubber", 1300, None, False, "top", "replace_mirror", None),
}

CV_PARTS = {
    "FBMP": ("Front bumper (steel)", "metal", 4800, 1500, True, "front", "rr_bumper", None),
    "CDOR": ("Cabin door", "metal", 14500, 4000, True, "right", "rr_door", None),
    "FPNL": ("Front cabin panel / bonnet", "metal", 9500, 3000, True, "front", "rr_bonnet", None),
    "WSCR": ("Windshield", "glass", 6500, None, False, "glass", "replace_windshield", None),
    "HLMP": ("Headlamp", "plastic", 2800, None, False, "front", "replace_lamp", None),
    "LBSD": ("Load body side panel", "metal", 7500, 2500, True, "left", "rr_door", None),
    "LBTG": ("Load body tailgate", "metal", 6800, 2200, True, "rear", "rr_bonnet", None),
    "ORVM": ("Mirror", "plastic", 1400, None, False, "right", "replace_mirror", None),
    "RADI": ("Radiator", "metal", 8200, None, False, "front", "replace_radiator", None),
    "TYRE": ("Tyre", "rubber", 6500, None, False, "wheel", "replace_wheel", None),
}

PARTS_BY_TYPE = {"Car": CAR_PARTS, "2W": TW_PARTS, "CV": CV_PARTS}

# --- §12.5 Labour ----------------------------------------------------------------------------------

LABOUR_RATES = {
    "car_rates": {
        "tier1": {"authorised": 1100, "multibrand": 750},
        "tier2": {"authorised": 850, "multibrand": 600},
        "tier3": {"authorised": 650, "multibrand": 450},
    },
    "vehicle_type_multiplier": {"Car": 1.0, "2W": 0.45, "CV": 1.10},
}

LABOUR_OPERATIONS = {
    "hours": {
        "rr_bumper": {"label": "Remove & refit bumper", "hours": 1.5},
        "rr_bonnet": {"label": "Remove & refit bonnet / tailgate", "hours": 1.0},
        "rr_door": {"label": "Remove & refit door (incl. trims)", "hours": 2.0},
        "rr_fender": {"label": "Remove & refit fender", "hours": 1.5},
        "replace_lamp": {"label": "Replace headlamp / tail lamp / fog lamp", "hours": 0.5},
        "replace_mirror": {"label": "Replace mirror", "hours": 0.5},
        "replace_windshield": {"label": "Replace windshield / rear glass", "hours": 2.0},
        "replace_door_glass": {"label": "Replace door glass", "hours": 1.0},
        "replace_radiator": {"label": "Replace radiator / condenser", "hours": 2.5},
        "replace_quarter": {"label": "Replace quarter panel (cut & weld)", "hours": 6.0},
        "repair_minor_dent": {"label": "Dent repair — minor (< 10% of panel)", "hours": 1.5},
        "repair_moderate_dent": {"label": "Dent repair — moderate (10–30% of panel)", "hours": 3.0},
        "plastic_repair": {"label": "Plastic repair / welding", "hours": 1.5},
        "wheel_alignment": {"label": "Wheel alignment & balancing (after front impact)", "hours": 1.0},
        "airbag": {"label": "Airbag replacement (each) incl. diagnostics", "hours": 2.0},
        # Additions for parts the §12.5 table does not name (recorded in PROGRESS decisions).
        "replace_roof": {"label": "Replace roof panel (cut & weld)", "hours": 8.0},
        "rr_trim": {"label": "Remove & refit grille / garnish", "hours": 0.5},
        "replace_wheel": {"label": "Replace wheel / tyre incl. balancing", "hours": 0.5},
        "replace_battery": {"label": "Replace battery", "hours": 0.3},
    },
    "vehicle_type_multiplier": {"Car": 1.0, "2W": 0.5, "CV": 1.3},
}

# --- §12.6 Paint -------------------------------------------------------------------------------------

PAINT_RATES = {
    "per_panel": {
        "CAR_ENTRY": {"rate": 3200, "metallic_surcharge": 0.10},
        "CAR_PREMIUM_HATCH": {"rate": 3800, "metallic_surcharge": 0.10},
        "CAR_COMPACT_SUV_SEDAN": {"rate": 4200, "metallic_surcharge": 0.12},
        "CAR_MID_SUV_MPV": {"rate": 5200, "metallic_surcharge": 0.12},
        "TW_COMMUTER": {"rate": 900, "metallic_surcharge": 0.0},
        "TW_PREMIUM": {"rate": 1400, "metallic_surcharge": 0.0},
        "CV_LCV": {"rate": 3500, "metallic_surcharge": 0.0},
    },
    "blend_pct": 0.40,
    "material_share": 0.25,
    "material_depreciation": 0.50,
}

# --- §12.7 Depreciation, §12.8 Deductibles ----------------------------------------------------------

DEPRECIATION_RULES = {
    "material_pct": {"rubber": 50, "nylon": 50, "plastic": 50, "tyre": 50, "battery": 50, "fibreglass": 30, "glass": 0, "airbag": 0},
    "metal_by_age_months": [
        {"max_months": 6, "pct": 0},
        {"max_months": 12, "pct": 5},
        {"max_months": 24, "pct": 10},
        {"max_months": 36, "pct": 15},
        {"max_months": 48, "pct": 25},
        {"max_months": 60, "pct": 35},
        {"max_months": 120, "pct": 40},
        {"max_months": None, "pct": 50},
    ],
    "consumables_line": {"Car": 600, "2W": 200, "CV": 800},
}

DEDUCTIBLES = {
    "compulsory": {"car_upto_1500cc": 1000, "car_above_1500cc": 2000, "2W": 100, "CV": 500},
    "applies_to": ["OD", "Glass", "Theft", "Total loss"],
    "total_loss_threshold_pct": 75,
    "salvage_pct_range": [15, 25],
}

# --- §13 Fraud rules (conditions are evaluated in dmn_engine.py, keyed by id) ----------------------

FRAUD_RULES = [
    ("FR-01", "Location contradiction (FASTag/telematics)", "A FASTag or parking event within ±90 min of the reported time is more than 25 km from the reported location, or a toll on the claimed route is absent.", 35, "fail", "We need to confirm where the vehicle was at the time of the incident."),
    ("FR-02", "Pre-existing damage", "The damage assessment reports pre-existing damage with confidence ≥ 0.70 on a claimed part.", 30, "fail", "We need a few more photos of the damaged area."),
    ("FR-03", "Narrative–damage inconsistency", "Impact direction or severity contradicts the reported story (confidence ≥ 0.65).", 20, "fail", "Could you describe how the incident happened in a little more detail?"),
    ("FR-04", "Frequent claimant (IIB)", "Two or more OD claims in the last 12 months across insurers.", 15, "warn", "We need details of your recent claims history."),
    ("FR-05", "Early claim after inception / break-in", "Incident within 30 days of policy start, or the policy was issued after a break in cover.", 15, "warn", "We need your previous policy details."),
    ("FR-06", "Garage overquote", "Garage quote 15–30% above the assessed estimate (5 pts, warn) or more than 30% (15 pts, fail).", 15, "fail", "We are reviewing the repair estimate with your garage."),
    ("FR-07", "Organised network link", "Phone, garage, surveyor or bank account shared with two or more other high-risk claims in 180 days.", 25, "fail", "We need to verify a few contact details."),
    ("FR-08", "Vehicle blacklisted or reported stolen", "Vahan or NCRB shows the vehicle as blacklisted or stolen. Hard stop.", 40, "fail", "We need to verify your vehicle's registration details."),
    ("FR-09", "RC owner differs from policyholder", "Owner name on RC does not match the policyholder (fuzzy ratio < 0.85) without a transfer record.", 15, "warn", "Please share proof of vehicle ownership transfer."),
    ("FR-10", "Driving licence invalid", "Licence expired on the incident date, or its class does not cover the vehicle.", 20, "fail", "Please share a copy of the driver's valid licence."),
    ("FR-11", "Photo metadata mismatch", "Photo EXIF time more than 24 h before the incident, or EXIF GPS more than 25 km from the reported location.", 15, "warn", "We need a few fresh photos of the vehicle."),
    ("FR-12", "Late intimation", "Reported more than 7 days after the incident.", 10, "warn", "Please tell us why the claim was reported after a few days."),
    ("FR-13", "Commercial use of private vehicle", "Evidence of commercial use of a privately registered vehicle.", 15, "warn", "Please confirm how the vehicle is normally used."),
    ("FR-14", "Unwitnessed night single-vehicle accident", "Between 23:00 and 05:00, no third party and no witness.", 5, "warn", "If anyone saw the incident, please share their contact details."),
    ("FR-15", "Document tampering signs", "The document check reports tampering indicators with confidence ≥ 0.7.", 25, "fail", "Please upload a clearer copy of your documents."),
    ("FR-16", "Vehicle identity mismatch", "Make/model or number plate in the photos does not match the policy, Vahan or RC record (confidence ≥ 0.75).", 30, "fail", "Please share clearer photos showing the whole vehicle and number plate."),
    ("FR-17", "Different vehicles across photos", "At least one photo appears to show a different vehicle from the others (confidence ≥ 0.75).", 25, "fail", "Please share clearer photos showing the whole vehicle and number plate."),
    ("FR-18", "Vehicle detail unclear / colour mismatch", "Colour differs from the registered colour, or make/model and plate are unclear on all photos.", 5, "warn", "Please share clearer photos showing the whole vehicle and number plate."),
]


def fraud_rules_json() -> list[dict]:
    return [
        {"id": rid, "name": name, "description": desc, "points": pts, "level": level,
         "customer_safe_reason": safe, "enabled": True,
         **({"points_warn": 5, "points_fail": 15} if rid == "FR-06" else {}),
         **({"hard_stop": True} if rid == "FR-08" else {})}
        for rid, name, desc, pts, level, safe in FRAUD_RULES
    ]


def models_json() -> list[dict]:
    return [
        {"key": prefix, "make": make, "model": model, "segment": seg, "type": SEGMENTS[seg]["type"],
         "cc": cc, "fuel": fuel, "ex_showroom": price}
        for make, model, prefix, seg, cc, fuel, price in MODELS
    ]


def parts_catalog_json(rng: random.Random) -> list[dict]:
    """round(base × segment factor × model jitter(0.92–1.08), -1) per model; pinned prices override."""
    out = []
    for _make, model, prefix, seg, *_ in MODELS:
        vtype = SEGMENTS[seg]["type"]
        factor = SEGMENTS[seg]["factor"]
        jitter = rng.uniform(0.92, 1.08)
        for code, (name, material, replace, repair, painted, zone, rr_op, via) in PARTS_BY_TYPE[vtype].items():
            part_code = f"{prefix}-{code}"
            price = PINNED_PRICES.get(part_code, round(replace * factor * jitter, -1))
            out.append({
                "part_code": part_code, "model_key": prefix, "model": model, "base_code": code, "part": name,
                "material": material, "replace": int(price),
                "repair": int(round(repair * factor * jitter, -1)) if repair else None,
                "painted": painted, "zone": zone, "rr_operation": rr_op,
                "rr_accessed_via": [f"{prefix}-{v}" for v in via] if via else None,
            })
    return out


# --- §11.1 Cities (state, tier, lat/lng, RTO codes for realistic registrations, seed weight) -----

CITIES = [
    ("Pune", "Maharashtra", 1, 18.52, 73.86, ["MH 12", "MH 14"], 14),
    ("Mumbai", "Maharashtra", 1, 19.08, 72.88, ["MH 01", "MH 02", "MH 03", "MH 47"], 13),
    ("Thane", "Maharashtra", 1, 19.22, 72.98, ["MH 04", "MH 05"], 7),
    ("Nashik", "Maharashtra", 2, 20.00, 73.79, ["MH 15"], 4),
    ("Nagpur", "Maharashtra", 2, 21.15, 79.09, ["MH 31", "MH 49"], 4),
    ("Pimpri-Chinchwad", "Maharashtra", 1, 18.63, 73.80, ["MH 14"], 3),
    ("Aurangabad", "Maharashtra", 2, 19.88, 75.34, ["MH 20"], 2),
    ("Kolhapur", "Maharashtra", 3, 16.70, 74.24, ["MH 09"], 1),
    ("New Delhi", "Delhi", 1, 28.61, 77.21, ["DL 3C", "DL 8C", "DL 4C", "DL 1C"], 9),
    ("Gurugram", "Haryana", 1, 28.46, 77.03, ["HR 26"], 3),
    ("Noida", "Uttar Pradesh", 1, 28.54, 77.39, ["UP 16"], 3),
    ("Bengaluru", "Karnataka", 1, 12.97, 77.59, ["KA 01", "KA 03", "KA 05", "KA 51", "KA 53"], 9),
    ("Mysuru", "Karnataka", 2, 12.30, 76.64, ["KA 09"], 1),
    ("Chennai", "Tamil Nadu", 1, 13.08, 80.27, ["TN 01", "TN 09", "TN 22"], 6),
    ("Coimbatore", "Tamil Nadu", 2, 11.02, 76.96, ["TN 37", "TN 66"], 2),
    ("Hyderabad", "Telangana", 1, 17.39, 78.49, ["TS 09", "TS 07", "TS 08"], 6),
    ("Ahmedabad", "Gujarat", 1, 23.02, 72.57, ["GJ 01", "GJ 27"], 5),
    ("Surat", "Gujarat", 2, 21.17, 72.83, ["GJ 05"], 2),
    ("Kolkata", "West Bengal", 1, 22.57, 88.36, ["WB 02", "WB 06"], 4),
    ("Jaipur", "Rajasthan", 2, 26.91, 75.79, ["RJ 14"], 3),
    ("Udaipur", "Rajasthan", 3, 24.59, 73.71, ["RJ 27"], 1),
    ("Lucknow", "Uttar Pradesh", 2, 26.85, 80.95, ["UP 32"], 3),
    ("Indore", "Madhya Pradesh", 2, 22.72, 75.86, ["MP 09"], 2),
    ("Kochi", "Kerala", 2, 9.93, 76.27, ["KL 07"], 3),
    ("Thiruvananthapuram", "Kerala", 2, 8.52, 76.94, ["KL 01"], 1),
    ("Chandigarh", "Chandigarh", 2, 30.73, 76.78, ["CH 01"], 1),
    ("Bhubaneswar", "Odisha", 2, 20.30, 85.82, ["OD 02"], 1),
    ("Goa (Panaji)", "Goa", 3, 15.49, 73.83, ["GA 01"], 1),
]


def cities_json() -> list[dict]:
    return [{"city": c, "state": s, "tier": t, "lat": lat, "lng": lng, "rto_codes": rto}
            for c, s, t, lat, lng, rto, _w in CITIES]


# §11.5 Required documents by vehicle type. Conditional items carry the condition keys that trigger them.
def _doc(key, label, **extra):
    return {"doc": key, "label": label, **extra}


DOCUMENT_REQUIREMENTS = {
    "2W": {
        "mandatory": [_doc("claim_form", "Claim form (signed or digital)"), _doc("policy", "Policy copy or cover note"),
                      _doc("rc", "RC copy"), _doc("dl", "Driving licence of rider"), _doc("kyc", "KYC (Aadhaar / PAN / Voter ID / Passport)")],
        "conditional": [
            _doc("fir", "FIR", when=["theft", "third_party"], reason="Required for theft and third-party claims"),
            _doc("original_rc", "Original RC", when=["theft"], reason="Surrendered on a theft settlement"),
            _doc("original_policy", "Original policy", when=["theft"], reason="Required for theft settlement"),
            _doc("tax_receipt", "Road tax receipt", when=["theft"], reason="Required for theft settlement"),
            _doc("rto_theft_declaration", "RTO theft declaration", when=["theft"], reason="Informs the RTO the vehicle was stolen"),
            _doc("original_keys", "All original keys", when=["theft"], reason="Confirms the vehicle was locked and keys are accounted for"),
            _doc("repair_bills", "Original repair bills and payment receipts", when=["reimbursement"], reason="Needed to reimburse repairs you paid for"),
        ],
        "optional": [_doc("photos", "Photos of vehicle and site (strongly recommended)"), _doc("witness", "Witness details")],
    },
    "Car": {
        "mandatory": [_doc("claim_form", "Claim form (signed or digitally authorised)"), _doc("rc", "RC (verified copy)"),
                      _doc("dl", "Driving licence of driver"), _doc("policy", "Policy documents"), _doc("kyc", "KYC")],
        "conditional": [
            _doc("fir", "FIR", when=["theft", "major_accident", "bodily_injury", "malicious_damage", "third_party"],
                 reason="Required for theft, major accidents, injury, malicious damage and third-party property damage"),
            _doc("repair_estimate", "Repair estimate", when=["reimbursement"], reason="Needed to assess a reimbursement claim"),
            _doc("repair_invoice", "Final invoices and payment receipts", when=["reimbursement"], reason="Needed to reimburse repairs you paid for"),
            _doc("lender_noc", "Lender NOC + Form 35", when=["financed"], reason="The vehicle is hypothecated to a lender"),
            _doc("rto_forms", "RTO Forms 28, 29, 30", when=["second_hand_or_total_loss", "theft"], reason="Transfer of ownership to the insurer"),
            _doc("purchase_invoice", "Original purchase invoice", when=["rti_claim"], reason="Return-to-invoice add-on claim"),
            _doc("original_keys", "Original keys", when=["theft"], reason="Confirms the keys are accounted for"),
            _doc("subrogation_letter", "Subrogation letter", when=["theft"], reason="Transfers recovery rights to the insurer"),
            _doc("discharge_voucher", "Claim discharge voucher", when=["theft"], reason="Signed on settlement of a theft claim"),
        ],
        "optional": [_doc("cancelled_cheque", "Cancelled cheque (required only for reimbursement)"), _doc("photos", "Photos / videos"),
                     _doc("medical", "Medical reports & bills (bodily injury)")],
    },
    "CV": {
        "mandatory": [_doc("claim_form", "Claim form"), _doc("rc", "RC"), _doc("dl", "Driving licence valid for the vehicle class"),
                      _doc("fitness", "Fitness certificate"), _doc("permit", "Permit")],
        "conditional": [
            _doc("repair_estimate", "Repair estimates and final bills", when=["damage"], reason="Needed to assess the damage"),
            _doc("fir", "FIR", when=["theft", "third_party"], reason="Required for theft and third-party claims"),
        ],
        "optional": [_doc("policy", "Physical policy copy (if not verifiable digitally)")],
    },
}
