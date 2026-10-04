"""Deterministic vehicle-identity comparison (AGENT_PROMPTS.md A4). Gemini reports what each photo shows; Python decides.

Per attribute, the photos' reading is compared with the policy vehicle, the Vahan record and the RC extraction:
- make & model: normalised alias match → match / mismatch / unclear (make/model confidence < 0.75 → unclear)
- body type: family match (hatch, sedan, suv/mpv, scooter, motorcycle, commercial)
- colour: colour-family match (light / mid / dark / warm); a mismatch is a warning only
- plate: normalised exact match = pass; ≥ 2 differing characters with plate confidence ≥ 0.75 = mismatch; otherwise unclear
- cross-photo: any photo with same_vehicle = false (confidence ≥ 0.75)
The result is stored as `claim.vehicle_identity` and feeds FR-16 / FR-17 / FR-18.
"""
from __future__ import annotations

import re

CONF = 0.75

MAKE_ALIASES = {
    "maruti": "maruti", "suzuki": "maruti", "marutisuzuki": "maruti", "hyundai": "hyundai", "hyundaimotor": "hyundai", "tata": "tata",
    "tatamotors": "tata", "mahindra": "mahindra", "mahindramahindra": "mahindra", "mahindraandmahindra": "mahindra", "kia": "kia",
    "honda": "honda", "toyota": "toyota", "renault": "renault", "hero": "hero", "heromotocorp": "hero", "tvs": "tvs", "bajaj": "bajaj",
    "royalenfield": "royalenfield", "ashokleyland": "ashokleyland", "volkswagen": "volkswagen", "vw": "volkswagen", "skoda": "skoda",
    "mg": "mg", "nissan": "nissan", "ford": "ford",
}
# Body of each catalogue model (vehicle_models.json keys) — the photos are compared by family.
MODEL_BODY = {
    "MAR-ALT": "hatch", "MAR-WAG": "hatch", "REN-KWD": "hatch", "MAR-SWI": "hatch", "MAR-BAL": "hatch", "MAR-DZI": "sedan",
    "HYU-I20": "hatch", "TAT-PUN": "suv", "TAT-ALT": "hatch", "HYU-CRE": "suv", "HYU-VEN": "suv", "TAT-NEX": "suv", "MAR-BRZ": "suv",
    "KIA-SEL": "suv", "HON-CIT": "sedan", "MAH-XUV": "suv", "MAH-SCN": "suv", "TOY-INH": "mpv", "KIA-CAR": "mpv", "HON-ACT": "scooter",
    "HER-SPL": "motorcycle", "HON-SHI": "motorcycle", "TVS-JUP": "scooter", "BAJ-PNS": "motorcycle", "ROY-CLA": "motorcycle",
    "TVS-APA": "motorcycle", "TAT-ACE": "pickup", "ASH-DOS": "pickup", "MAH-BPU": "pickup",
}
BODY_FAMILY = {"hatch": "hatch", "sedan": "sedan", "suv": "utility", "mpv": "utility", "scooter": "scooter", "motorcycle": "motorcycle",
               "pickup": "commercial", "truck": "commercial", "van": "commercial"}
COLOUR_FAMILY = [  # first keyword hit wins
    ("light", ("white", "pearl", "silver", "beige", "champagne", "cream", "ivory")),
    ("dark", ("black", "charcoal", "midnight", "dark")),
    ("warm", ("red", "orange", "yellow", "maroon", "brown", "bronze", "copper", "gold", "wine")),
    ("mid", ("grey", "gray", "blue", "green", "teal", "purple")),
]


def _alnum(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def make_key(make: str | None) -> str | None:
    k = _alnum(make)
    if not k:
        return None
    return MAKE_ALIASES.get(k) or next((v for a, v in MAKE_ALIASES.items() if k.startswith(a)), k)


def model_matches(observed: str | None, reference: str | None) -> bool | None:
    """"Creta" ~ "CRETA 1.5 SX" ~ "Hyundai Creta"; "Innova Crysta" ≠ "Innova Hycross". None when either side is unknown."""
    o, r = _alnum(observed), _alnum(reference)
    if not o or not r:
        return None
    return o in r or r in o


def colour_family(colour: str | None) -> str | None:
    c = (colour or "").lower()
    return next((fam for fam, words in COLOUR_FAMILY if any(w in c for w in words)), None)


def plate_norm(plate: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (plate or "").upper())


def _distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def compare_plate(read: str | None, conf: float, expected: str) -> str:
    r, e = plate_norm(read), plate_norm(expected)
    if not r:
        return "unclear"
    if r == e:
        return "match"
    return "mismatch" if _distance(r, e) >= 2 and conf >= CONF else "unclear"


def _split_make_model(text: str | None, make_hint: str | None) -> tuple[str | None, str | None]:
    """'MARUTI SUZUKI BALENO ZETA' → ('maruti', 'BALENO ZETA') using the make aliases."""
    if not text:
        return None, None
    words = text.split()
    for n in (3, 2, 1):
        k = make_key(" ".join(words[:n]))
        if k in MAKE_ALIASES.values() and _alnum(" ".join(words[:n])) in MAKE_ALIASES:
            return k, " ".join(words[n:]) or None
    return make_key(make_hint), text


def _mm_result(photo: dict, ref_make: str | None, ref_model: str | None) -> str:
    if not photo.get("make") and not photo.get("model"):
        return "unclear"
    if (photo.get("idcon") or 0) < CONF:
        return "unclear"
    om, rm = make_key(photo.get("make")), make_key(ref_make)
    if om and rm and om != rm:
        return "mismatch"
    m = model_matches(photo.get("model"), ref_model)
    if m is None:
        return "unclear"
    return "match" if m else "mismatch"


def not_assessed(reason: str) -> dict:
    return {"status": "not_assessed", "reason": reason, "photos": [], "comparison": [], "cross_photo": None,
            "fr16": False, "fr17": False, "fr18": False}


def compare(damage: dict, *, vehicle: dict, vahan: dict | None, rc: dict | None) -> dict:
    """`damage` is the Damage agent output (dict of DamageOut). `vehicle` is the vehicles.json record."""
    photos = [p for p in damage.get("photos", [])]
    identified = [p for p in photos if p.get("make") or p.get("model")]
    exp_body = BODY_FAMILY.get(MODEL_BODY.get(vehicle.get("model_key"), ""), None)
    exp_colour = colour_family(vehicle.get("colour"))
    registration = vehicle["registration"]

    sources = {"policy": (vehicle.get("make"), vehicle.get("model"))}
    if vahan and vahan.get("make_model"):
        sources["vahan"] = _split_make_model(vahan["make_model"], vehicle.get("make"))
    if rc and rc.get("make_model"):
        sources["rc"] = _split_make_model(rc["make_model"], vehicle.get("make"))

    per_photo = []
    for p in photos:
        mm = {src: _mm_result(p, mk, md) for src, (mk, md) in sources.items()}
        body_obs = BODY_FAMILY.get(p.get("body") or "")
        col_obs = colour_family(p.get("colour"))
        per_photo.append({
            "photo_id": p["photo_id"], "make": p.get("make"), "model": p.get("model"), "body": p.get("body"), "colour": p.get("colour"),
            "plate_text": p.get("plate_text"), "plate_conf": p.get("plate_conf") or 0, "idcon": p.get("idcon") or 0,
            "same_vehicle": p.get("same_vehicle"), "same_conf": p.get("same_conf") or 0, "diff_reason": p.get("diff_reason"),
            "identified": bool(p.get("make") or p.get("model")),
            "make_model": "mismatch" if "mismatch" in mm.values() else ("match" if "match" in mm.values() else "unclear"),
            "body_result": "unclear" if not body_obs or not exp_body else ("match" if body_obs == exp_body else "mismatch"),
            "colour_result": "unclear" if not col_obs or not exp_colour else ("match" if col_obs == exp_colour else "mismatch"),
            "plate_result": compare_plate(p.get("plate_text"), p.get("plate_conf") or 0, registration),
        })

    def overall(key: str) -> str:
        vals = [pp[key] for pp in per_photo]
        if "mismatch" in vals:
            return "mismatch"
        return "match" if "match" in vals else "unclear"

    mm_all, plate_all = overall("make_model"), overall("plate_result")
    body_all, colour_all = overall("body_result"), overall("colour_result")
    best = max(identified, key=lambda p: p.get("idcon") or 0, default=None)
    plate_best = max(photos, key=lambda p: p.get("plate_conf") or 0, default=None)

    def row(attribute: str, observed, conf, result: str, refs: dict, fail_level: str = "fail") -> dict:
        level = {"match": "pass", "mismatch": fail_level, "unclear": "warn"}[result]
        return {"attribute": attribute, "observed": observed, "confidence": conf, "result": result, "level": level, "sources": refs}

    def overall_vs(expected: str) -> str:
        vals = [compare_plate(p.get("plate_text"), p.get("plate_conf") or 0, expected) for p in photos]
        return "mismatch" if "mismatch" in vals else ("match" if "match" in vals else "unclear")

    def src_result(src: str) -> str:
        vals = [_mm_result(p, *sources[src]) for p in identified]
        return "mismatch" if "mismatch" in vals else ("match" if "match" in vals else "unclear")

    comparison = [
        row("Make & model", best and " ".join(x for x in (best.get("make"), best.get("model")) if x), best and best.get("idcon"), mm_all,
            {src: {"value": " ".join(x for x in (mk and mk.title(), md) if x) if src != "policy" else f"{mk} {md}",
                   "result": src_result(src)} for src, (mk, md) in sources.items()}),
        row("Body type", best and best.get("body"), best and best.get("idcon"), body_all,
            {"policy": {"value": MODEL_BODY.get(vehicle.get("model_key")), "result": body_all}}),
        row("Colour", best and best.get("colour"), best and best.get("idcon"), colour_all,
            {"policy": {"value": vehicle.get("colour"), "result": colour_all},
             **({"rc": {"value": rc.get("colour"), "result": colour_all}} if rc and rc.get("colour") else {})}, fail_level="warn"),
        row("Number plate", plate_best and plate_best.get("plate_text"), plate_best and plate_best.get("plate_conf"), plate_all,
            {"policy": {"value": registration, "result": plate_all},
             **({"vahan": {"value": vahan.get("registration"), "result": plate_all}} if vahan else {}),
             # photo plate vs the RC reading (like every other column); unread plate → unclear
             **({"rc": {"value": rc.get("registration"), "result": overall_vs(rc["registration"])}}
                if rc and rc.get("registration") else {})}),
    ]

    differing = [{"photo_id": p["photo_id"], "reason": p.get("diff_reason"), "confidence": p.get("same_conf") or 0}
                 for p in photos if p.get("same_vehicle") is False and (p.get("same_conf") or 0) >= CONF]
    uncertain = [p["photo_id"] for p in photos if p.get("same_vehicle") is False and (p.get("same_conf") or 0) < CONF]
    if len(photos) < 2:
        cross = {"level": "pending", "summary": "Only one photo — cross-photo check not applicable", "differing": []}
    elif differing:
        cross = {"level": "fail", "summary": f"{len(differing)} photo(s) appear to show a different vehicle", "differing": differing}
    elif uncertain:
        cross = {"level": "warn", "summary": "Photos may not all show the same vehicle (low confidence)", "differing": []}
    else:
        cross = {"level": "pass", "summary": "All photos show the same vehicle", "differing": []}

    fr16 = mm_all == "mismatch" or plate_all == "mismatch"
    fr17 = bool(differing)
    fr18 = colour_all == "mismatch" or (mm_all == "unclear" and plate_all == "unclear")
    if fr16 or fr17:
        status = "mismatch"
    elif mm_all == "match" and not fr18:
        status = "consistent"
    else:
        status = "unclear"

    evidence = []
    if mm_all == "mismatch" and best:
        evidence.append(f"Photo {best['photo_id']} shows {best.get('make') or ''} {best.get('model') or ''} "
                        f"({best.get('idcon'):.2f}); insured vehicle is {vehicle.get('make')} {vehicle.get('model')}".replace("  ", " "))
    if plate_all == "mismatch" and plate_best:
        evidence.append(f"Plate read as {plate_best.get('plate_text')} ({plate_best.get('plate_conf'):.2f}); registered {registration}")
    for d in differing:
        evidence.append(f"Photo {d['photo_id']} differs from the others ({d['confidence']:.2f}): {d['reason'] or 'different vehicle'}")
    if colour_all == "mismatch":
        evidence.append(f"Photo colour {best and best.get('colour')} vs registered {vehicle.get('colour')}")
    if mm_all == "unclear" and plate_all == "unclear":
        evidence.append("Make/model and number plate could not be read clearly on any photo")

    summary = {
        "consistent": f"Photos show the insured {vehicle.get('make')} {vehicle.get('model')}",
        "mismatch": "Photos do not match the insured vehicle" if fr16 else "Photos appear to show more than one vehicle",
        "unclear": "Vehicle could not be confirmed from the photos",
    }[status]
    return {"status": status, "summary": summary, "photos": per_photo, "comparison": comparison, "cross_photo": cross,
            "fr16": fr16, "fr17": fr17, "fr18": fr18, "evidence": evidence,
            "identity_summary": damage.get("identity_summary")}


def as_check(identity: dict | None) -> dict:
    """The Verification tab's "Vehicle identity" check card."""
    if not identity or identity.get("status") == "not_assessed":
        return {"level": "pending", "summary": (identity or {}).get("reason") or "Not assessed", "data": {}, "latency_ms": 0}
    level = {"consistent": "pass", "unclear": "warn", "mismatch": "fail"}[identity["status"]]
    return {"level": level, "summary": identity["summary"], "data": {"evidence": identity.get("evidence", [])}, "latency_ms": 0}
