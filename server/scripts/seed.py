"""Generate deterministic demo data (spec §11.3). Run from /server:  python scripts/seed.py

- `random.seed(2026)` + Faker `en_IN` seeded → identical content on every run.
- Dates are relative to the seed anchor (default: now in IST; override with SEED_ANCHOR=2026-10-02T10:30)
  so "today" figures on Home stay meaningful when the demo data is reset.
- Every amount comes from services/costing.py and every risk score from services/dmn_engine.py.
- users.json is preserved; missing demo users are added, existing entries are never touched.
- All writes go through services/json_store.py (atomic temp file + os.replace).
"""
from __future__ import annotations

import base64
import os
import random
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from faker import Faker

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(SERVER / "scripts"))

from app.schemas.claim import Claim  # noqa: E402
from app.services import costing, dmn_engine, reference  # noqa: E402
from app.services.json_store import read_json_sync, write_json_sync  # noqa: E402
import reference_data as R  # noqa: E402
import seed_media as SM  # noqa: E402
import seed_documents as SD  # noqa: E402
import make_specimen_docs as DOCS  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
STOCK = SERVER.parent / "client" / "public" / "assets" / "stock"

rng = random.Random(2026)
fake = Faker("en_IN")
fake.seed_instance(2026)


def anchor_now() -> datetime:
    raw = os.environ.get("SEED_ANCHOR")
    if raw:
        dt = datetime.fromisoformat(raw)
        return dt if dt.tzinfo else dt.replace(tzinfo=IST)
    return datetime.now(IST).replace(second=0, microsecond=0)


NOW = anchor_now()


def iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


def weighted(pairs):
    items, weights = zip(*pairs)
    return rng.choices(items, weights=weights, k=1)[0]


# ------------------------------------------------------------------------------------------------
# Users (preserved)
# ------------------------------------------------------------------------------------------------

DEFAULT_PREFS = {"theme": "system", "sidebar_collapsed": False, "density": "comfortable"}
USERS = [
    {"id": "u_001", "username": "Santosh Kute", "password_hash": "$2b$12$FMvqO7wOH9bEUeJ1BPx0b.vEXb6BcFMhRqx1Ery1L/X6k3L7XlY0S",
     "display_name": "Santosh Kute", "role": "admin", "is_developer": False, "title": "Head – Motor Claims",
     "email": "santosh.kute@abc-insurance.example", "avatar": None, "customer_id": None, "preferences": DEFAULT_PREFS},
    {"id": "u_002", "username": "Ameya Chauhan", "password_hash": "$2b$12$u.GvUtXfqcUxZpkhWX/GL.ZOC7sOD.ivr9bWXX2LN6nKSHnjSPjb6",
     "display_name": "Ameya Chauhan", "role": "admin", "is_developer": True, "title": "Solution Developer",
     "email": "ameya.chauhan@abc-insurance.example", "avatar": None, "customer_id": None, "preferences": DEFAULT_PREFS},
    {"id": "u_003", "username": "Rahul Sharma", "password_hash": "$2b$12$MVCyVTwnZhz.KTGJy7vTd.gj3WOklcy6zkX0IlbRmSpQB22LUMgVC",
     "display_name": "Rahul Sharma", "role": "customer", "is_developer": False, "title": "Policyholder",
     "email": "rahul.sharma@example.com", "avatar": None, "customer_id": "c_0001", "preferences": DEFAULT_PREFS},
]


def seed_users() -> int:
    existing = read_json_sync("users.json", []) or []
    names = {u.get("username", "").strip().casefold() for u in existing}
    merged = existing + [u for u in USERS if u["username"].casefold() not in names]
    write_json_sync("users.json", merged)
    return len(merged)


# ------------------------------------------------------------------------------------------------
# Reference data
# ------------------------------------------------------------------------------------------------

def seed_reference() -> None:
    write_json_sync("vehicle_models.json", R.models_json())
    write_json_sync("parts_catalog.json", R.parts_catalog_json(rng))
    write_json_sync("labour_rates.json", R.LABOUR_RATES)
    write_json_sync("labour_operations.json", R.LABOUR_OPERATIONS)
    write_json_sync("paint_rates.json", R.PAINT_RATES)
    write_json_sync("depreciation_rules.json", R.DEPRECIATION_RULES)
    write_json_sync("deductibles.json", R.DEDUCTIBLES)
    write_json_sync("fraud_rules.json", R.fraud_rules_json())
    write_json_sync("cities.json", R.cities_json())
    write_json_sync("document_requirements.json", R.DOCUMENT_REQUIREMENTS)
    reference.reload()


CITY = {c[0]: {"city": c[0], "state": c[1], "tier": c[2], "lat": c[3], "lng": c[4], "rto": c[5], "w": c[6]} for c in R.CITIES}
MODELS = {m[2]: {"make": m[0], "model": m[1], "key": m[2], "segment": m[3], "cc": m[4], "fuel": m[5], "price": m[6],
                 "type": R.SEGMENTS[m[3]]["type"]} for m in R.MODELS}
MODELS_BY_TYPE = {t: [m for m in MODELS.values() if m["type"] == t] for t in ("Car", "2W", "CV")}
# Popularity weights so the fleet looks like Indian roads (Swift/Activa common, XUV700 rarer).
POPULARITY = {"MAR-SWI": 9, "MAR-BAL": 8, "MAR-DZI": 7, "MAR-WAG": 7, "MAR-ALT": 5, "HYU-CRE": 7, "TAT-NEX": 6,
              "TAT-PUN": 5, "HYU-I20": 5, "HYU-VEN": 4, "MAR-BRZ": 5, "KIA-SEL": 4, "HON-CIT": 4, "MAH-XUV": 3,
              "MAH-SCN": 3, "TOY-INH": 2, "KIA-CAR": 2, "REN-KWD": 3, "TAT-ALT": 3,
              "HON-ACT": 10, "HER-SPL": 9, "HON-SHI": 6, "TVS-JUP": 6, "BAJ-PNS": 3, "ROY-CLA": 4, "TVS-APA": 3,
              "TAT-ACE": 5, "ASH-DOS": 3, "MAH-BPU": 4}
LANG_BY_STATE = {"Maharashtra": "mr", "Karnataka": "kn", "Tamil Nadu": "ta", "Kerala": "ml", "Telangana": "te",
                 "West Bengal": "bn", "Gujarat": "gu", "Odisha": "or"}
LANGUAGE_LABEL = {"en": "English", "hi": "Hindi", "hi-en": "Hindi–English mix", "mr": "Marathi", "ml": "Malayalam", "ta": "Tamil",
                  "te": "Telugu", "kn": "Kannada", "bn": "Bengali", "gu": "Gujarati", "or": "Odia"}
COLOURS = ["Pearl White", "Silver", "Grey", "Red", "Blue", "Black", "Brown", "Orange"]


PUBLIC = SERVER.parent / "client" / "public"
# Curated, processed stock photos (scripts/stock_curation.py → fetch_stock_images.py build). Claims without a match get none.
PICKER = SM.MediaPicker((read_json_sync("stock_photo_manifest.json", {}) or {}).get("photos", []))
PHOTO_COLOUR: dict[str, str] = {}   # vehicle id → colour fixed by the first photo set used for it


def file_kb(url: str) -> int:
    path = PUBLIC / url.lstrip("/")
    return max(1, round(path.stat().st_size / 1024)) if path.exists() else 0


# ------------------------------------------------------------------------------------------------
# Garages, customers, vehicles, policies
# ------------------------------------------------------------------------------------------------

BRANDS = ["Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Honda", "Kia", "Toyota"]
LOCALITIES = {
    "Pune": ["Baner", "Hadapsar", "Wakad", "Kothrud"], "Mumbai": ["Andheri", "Kurla", "Goregaon", "Chembur"],
    "Thane": ["Majiwada", "Ghodbunder Road"], "New Delhi": ["Okhla", "Naraina", "Moti Nagar"],
    "Bengaluru": ["Whitefield", "Peenya", "Koramangala"], "Chennai": ["Guindy", "Ambattur"],
    "Hyderabad": ["Kukatpally", "Gachibowli"], "Kochi": ["Edappally", "Vyttila"],
}


def seed_garages() -> list[dict]:
    garages, n = [], 1
    for city in CITY.values():
        count = 3 if city["tier"] == 1 else (2 if city["tier"] == 2 else 1)
        for i in range(count):
            authorised = i % 2 == 0
            locality = rng.choice(LOCALITIES.get(city["city"], [city["city"]]))
            brand = rng.choice(BRANDS)
            name = f"{fake.last_name()} {brand} Service, {locality}" if authorised else f"{fake.last_name()} Auto Works, {locality}"
            garages.append({
                "id": f"g_{n:03d}", "name": name, "city": city["city"], "tier": city["tier"],
                "type": "authorised" if authorised else "multibrand", "cashless": rng.random() < 0.8,
                "rating": round(rng.uniform(3.8, 4.8), 1), "avg_tat_days": rng.randint(3, 9),
                "brands": [brand] if authorised else BRANDS, "contact": f"+91 20{rng.randint(10000000, 99999999)}",
            })
            n += 1
    return garages


def registration(city: dict) -> str:
    rto = rng.choice(city["rto"])
    letters = "ABCDEFGHJKLMNPRSTUVWXYZ"
    series = "".join(rng.choice(letters) for _ in range(rng.choice([1, 2, 2, 2])))
    return f"{rto} {series} {rng.randint(1, 9999):04d}"


def phone() -> str:
    return f"+91 9{rng.randint(1000, 9999)} {rng.randint(10000, 99999)}"


def make_customer(cid: str, name: str, city: str, language: str | None = None) -> dict:
    first, last = name.split(" ", 1)
    st = CITY[city]["state"]
    return {
        "id": cid, "name": name, "phone": phone(), "email": f"{first.lower()}.{last.lower().replace(' ', '')}@example.com",
        "city": city, "state": st, "address": f"{fake.building_number()}, {fake.street_name()}, {city}",
        "kyc": {"aadhaar": f"XXXX-XXXX-{rng.randint(1000, 9999)}", "pan": f"XXXXX{rng.randint(1000, 9999)}X", "verified": True},
        "avatar": None,
        "preferred_language": language or weighted([(LANG_BY_STATE.get(st, "hi"), 3), ("hi-en", 3), ("en", 3)]),
    }


def idv_for(price: int, age_months: int) -> int:
    for limit, dep in ((6, .05), (12, .15), (24, .20), (36, .30), (48, .40), (60, .50), (10**6, .60)):
        if age_months <= limit:
            return int(round(price * (1 - dep), -3))
    return int(price * .4)


def make_vehicle(vid: str, model_key: str, city: str, age_months: int, reg: str | None = None, colour: str | None = None) -> dict:
    m = MODELS[model_key]
    first_reg = NOW - timedelta(days=int(age_months * 30.4))
    return {
        "id": vid, "registration": reg or registration(CITY[city]), "make": m["make"], "model": m["model"],
        "model_key": model_key, "variant": rng.choice(["Base", "Mid", "Top"]), "segment": m["segment"], "fuel": m["fuel"],
        "cc": m["cc"], "registered_on": first_reg.date().isoformat(), "colour": colour or rng.choice(COLOURS),
        "chassis": f"XXXXXXXXXXXX{rng.randint(10000, 99999)}", "engine": f"XXXXXX{rng.randint(10000, 99999)}",
        "type": m["type"], "use": "commercial" if m["type"] == "CV" else "private",
    }


def make_policy(customer: dict, vehicle: dict, incident_at: datetime, *, early: bool = False, idv: int | None = None,
                add_ons: dict | None = None) -> dict:
    age = max(1, int((incident_at - datetime.fromisoformat(vehicle["registered_on"]).replace(tzinfo=IST)).days / 30.4))
    start = incident_at - timedelta(days=rng.randint(8, 25) if early else rng.randint(35, 350))
    code = {"Car": "PC", "2W": "TW", "CV": "CV"}[vehicle["type"]]
    product = {"Car": "Private Car Package", "2W": "Two-Wheeler Package", "CV": "Commercial Vehicle Package"}[vehicle["type"]]
    young = age <= 60
    ons = add_ons if add_ons is not None else {
        "zero_dep": vehicle["type"] != "CV" and young and rng.random() < 0.45,
        "consumables": vehicle["type"] == "Car" and rng.random() < 0.3,
        "engine_protect": vehicle["type"] == "Car" and rng.random() < 0.2,
        "rti": young and rng.random() < 0.15, "rsa": rng.random() < 0.5,
    }
    price = MODELS[vehicle["model_key"]]["price"]
    the_idv = idv or idv_for(price, age)
    return {
        "policy_no": f"ABC/{code}/{start.year}/{rng.randint(100000, 999999)}", "customer_id": customer["id"],
        "vehicle_id": vehicle["id"], "product": product, "cover": "OD+TP",
        "start": start.date().isoformat(), "end": (start + timedelta(days=364)).date().isoformat(),
        "idv": the_idv, "ncb_pct": rng.choice([0, 20, 25, 35, 45, 50]), "add_ons": ons,
        "voluntary_deductible": rng.choice([0, 0, 0, 0, 2500, 5000]) if vehicle["type"] == "Car" else 0,
        "premium": int(round(the_idv * rng.uniform(0.022, 0.034), -1)), "insurer": "ABC General Insurance",
        "status": "active", "previous_break_in": early and rng.random() < 0.5,
    }


# ------------------------------------------------------------------------------------------------
# Incidents and damage
# ------------------------------------------------------------------------------------------------

# incident type → (claim types, part pool by vehicle type, typical damage types, photo category)
INCIDENTS = {
    "rear_end": {"Car": ["RBMP", "TLGT", "TLMP", "QPNL", "FBRP"], "2W": ["TLMP", "SPNL", "SLNC", "INDC"], "CV": ["LBTG", "LBSD"],
                 "photo": "car-rear", "label": "Rear-end collision"},
    "front_collision": {"Car": ["FBMP", "BONT", "HLMP", "GRIL", "RADI", "CNDS", "FNDR", "FOGL"], "2W": ["FPNL", "HLMP", "FMDG", "FORK", "INDC", "HBAR"],
                        "CV": ["FBMP", "FPNL", "HLMP", "RADI", "WSCR"], "photo": "car-front", "label": "Front collision"},
    "side_swipe": {"Car": ["FDOR", "RDOR", "FNDR", "ORVM", "QPNL", "DGLS"], "2W": ["SPNL", "MIRR", "CGRD", "BLVR"], "CV": ["CDOR", "LBSD", "ORVM"],
                   "photo": "car-side", "label": "Side impact"},
    "parking_scrape": {"Car": ["FBMP", "RBMP", "FDOR", "RDOR", "QPNL"], "2W": ["SPNL", "FPNL"], "CV": ["LBSD"],
                       "photo": "scratched-door", "label": "Parking scrape"},
    "skid_fall": {"2W": ["FPNL", "SPNL", "HLMP", "MIRR", "HBAR", "CGRD", "BLVR", "INDC", "FMDG"], "photo": "two-wheeler", "label": "Skid and fall"},
    "pothole": {"Car": ["ALWH", "TYRE"], "CV": ["TYRE"], "photo": "car-front", "label": "Pothole / road hazard"},
    "glass": {"Car": ["WSCR"], "CV": ["WSCR"], "photo": "cracked-windshield", "label": "Windshield damage"},
    "flood": {"Car": ["FBMP", "RBMP", "BATT", "RADI", "HLMP", "TLMP", "FDOR", "RDOR", "CNDS"], "photo": "flooded-car", "label": "Flood / water ingress"},
    "animal": {"Car": ["FBMP", "BONT", "HLMP", "GRIL", "FOGL"], "2W": ["FPNL", "HLMP", "FMDG"], "CV": ["FBMP", "HLMP"],
               "photo": "broken-headlamp", "label": "Animal collision"},
    "theft": {"photo": "clean-vehicle", "label": "Vehicle theft"},
}

PLACES = {
    "Pune": ["Baner Road near Balewadi High Street", "Hinjewadi Phase 1 flyover", "Katraj–Dehu Road bypass", "FC Road signal"],
    "Mumbai": ["Western Express Highway near Goregaon", "LBS Marg, Kurla", "Eastern Freeway near Wadala", "SV Road, Bandra"],
    "Thane": ["Ghodbunder Road near Kasarvadavali", "Eastern Express Highway, Teen Haath Naka"],
    "New Delhi": ["Ring Road near AIIMS", "Outer Ring Road, Rohini", "NH48 near Mahipalpur"],
    "Bengaluru": ["Outer Ring Road near Marathahalli", "Hosur Road, Electronic City", "Old Airport Road"],
    "Chennai": ["OMR near Thoraipakkam", "Anna Salai near Teynampet", "GST Road, Tambaram"],
    "Hyderabad": ["Outer Ring Road near Gachibowli", "Necklace Road", "Kukatpally main road"],
    "Kolkata": ["EM Bypass near Ruby", "AJC Bose Road"], "Ahmedabad": ["SG Highway near Thaltej", "Ashram Road"],
    "Kochi": ["Edappally junction", "Vyttila hub"], "Jaipur": ["Tonk Road", "JLN Marg"],
}

STORIES = {
    "rear_end": ["Stopped at a red signal on {place}; a {other} behind me braked late and hit the rear.",
                 "Slowing down in traffic on {place} when a {other} rammed into the back of my vehicle."],
    "front_collision": ["A {other} cut across my lane on {place} and I hit it head-on at low speed.",
                        "Vehicle ahead stopped suddenly on {place}; I could not stop in time and hit its rear."],
    "side_swipe": ["A {other} overtaking on the left scraped along the side of my vehicle on {place}.",
                   "While taking a turn at {place}, a {other} hit the side of my vehicle."],
    "parking_scrape": ["Scraped against a pillar while reversing in the parking near {place}.",
                       "Found scratches and a dent on my parked vehicle near {place}."],
    "skid_fall": ["Bike skidded on loose gravel on {place} and fell on the left side.",
                  "Lost balance on a wet patch on {place}; the scooter slid and fell."],
    "pothole": ["Hit a deep pothole on {place}; the wheel and tyre were damaged.",
                "Drove over a broken manhole cover on {place} and the tyre burst."],
    "glass": ["A stone flew up from a truck on {place} and cracked the windshield.",
              "Windshield cracked by a falling branch while parked near {place}."],
    "flood": ["Heavy rain flooded the road near {place}; water entered the vehicle and it stalled.",
              "Vehicle was parked near {place} when the area flooded overnight."],
    "animal": ["A stray cow crossed suddenly on {place} and I hit it.", "A dog ran across {place}; I braked hard and hit the divider."],
    "theft": ["Parked the vehicle near {place} in the evening; it was missing when I returned.",
              "Vehicle was stolen from outside my building near {place} overnight."],
}
HINGLISH = {
    "rear_end": "Signal pe ruka tha {place} pe, peeche se {other} ne thok diya. Bumper aur dickey dono damage hue.",
    "front_collision": "{place} pe ek {other} achanak saamne aa gaya, brake lagaya par takkar ho gayi.",
    "side_swipe": "{place} pe ek {other} ne side se ragad diya, door pe dent aa gaya.",
    "parking_scrape": "{place} ke paas parking mein reverse karte waqt pillar se ragad gaya.",
    "skid_fall": "{place} pe gravel pe bike slip ho gayi aur left side gir gayi.",
    "theft": "{place} ke paas gaadi park ki thi, wapas aaya toh gaadi gayab thi.",
}
OTHERS = ["truck", "tempo", "auto-rickshaw", "car", "bus", "cab", "pickup van", "two-wheeler"]
DAMAGE_WORDS = {"plastic": ["crack", "broken", "scratch"], "metal": ["dent", "deformed", "scratch"], "glass": ["shattered", "crack"],
                "rubber": ["cut", "burst"], "battery": ["water damage"], "airbag": ["deployed"], "fibreglass": ["crack"]}


def place_for(city: str) -> str:
    return rng.choice(PLACES.get(city, [f"MG Road, {city}", f"{city} ring road", f"near {city} railway station"]))


def pick_items(incident: str, vtype: str, severity: str, *, catalogue_prefix: str) -> list[dict]:
    pool = INCIDENTS[incident].get(vtype) or INCIDENTS["front_collision"][vtype]
    n = {"minor": (1, 2), "moderate": (2, 3), "severe": (3, 6)}[severity]
    codes = rng.sample(pool, k=min(len(pool), rng.randint(*n)))
    items = []
    for code in codes:
        part = reference.load().parts[f"{catalogue_prefix}-{code}"]
        if part.get("repair") and severity != "severe" and part["material"] == "metal" and rng.random() < 0.6:
            op = "repair_minor_dent" if severity == "minor" else "repair_moderate_dent"
        elif part["material"] == "plastic" and part["painted"] and severity == "minor" and rng.random() < 0.5:
            op = "plastic_repair"
        else:
            op = "replace"
        items.append({"part_code": part["part_code"], "operation": op})
    return items


def damage_block(items: list[dict], severity: str, media: list[dict], photos: list[dict], *, pre_existing: list[dict] | None = None,
                 narrative: dict | None = None, overquote: bool = False) -> dict:
    """Damage findings. Boxes come from the photos the claim uses (hand-placed in the manifest), so they sit on damage."""
    parts = reference.load().parts
    out = []
    for it in items:
        p = parts[it["part_code"]]
        suffix = it["part_code"].rsplit("-", 1)[-1]
        on_photo = [b for ph in photos for b in ph["boxes"] if b["part"] == SM.PART_ALIASES.get(suffix, suffix)]
        dmg = on_photo[0]["damage_type"] if on_photo else rng.choice(DAMAGE_WORDS.get(p["material"], ["dent"]))
        fresh_boxes = SM.boxes_for(it["part_code"], suffix, media, photos, p["part"], kind="damage")
        old_boxes = SM.boxes_for(it["part_code"], suffix, media, photos, p["part"], kind="pre_existing")
        sev = "severe" if it["operation"] == "replace" and severity != "minor" else ("moderate" if it["operation"] != "plastic_repair" else "minor")
        low = rng.random() < 0.08 and not old_boxes
        conf = round(rng.uniform(0.62, 0.74), 2) if low else round(rng.uniform(0.82, 0.98), 2)
        ids = sorted({b["photo_id"] for b in fresh_boxes + old_boxes}) or [m["id"] for m in media[:1]]
        out.append({"part_code": p["part_code"], "part": p["part"], "zone": p["zone"], "damage_type": dmg, "severity": sev,
                    "operation": it["operation"], "fresh": not old_boxes, "confidence": conf, "photo_ids": ids,
                    "boxes": old_boxes or fresh_boxes, "flag": "fail" if old_boxes else ("warn" if low else "pass")}
                   | ({"flag_note": "Low confidence — needs human review"} if low else {}))
    if overquote and out:
        priciest = max((i for i in out if i["operation"] == "replace"), key=lambda i: parts[i["part_code"]]["replace"], default=out[0])
        priciest["flag"], priciest["flag_note"] = "warn", "Garage quotes this part above the catalogue rate"
    for pe in pre_existing or []:
        pe.setdefault("boxes", [])
        if not pe["boxes"]:
            pe["boxes"] = [{"photo_id": m["id"], "box_2d": b["box_2d"], "label": f"{pe['part']} · {b['damage_type']}"}
                           for m, ph in zip(media, photos) for b in ph["boxes"] if b.get("kind") == "pre_existing"]
        pe["photo_ids"] = sorted({b["photo_id"] for b in pe["boxes"]}) or pe.get("photo_ids", [])
    views = {m["slot"] for m in media}
    return {
        "items": out, "pre_existing": pre_existing or [],
        "narrative_consistency": narrative or {"consistent": True, "explanation": "Impact direction and severity match the description.",
                                               "confidence": round(rng.uniform(0.8, 0.95), 2)},
        "photo_coverage": {z: z in views for z in ("front", "rear", "left", "right", "closeup")} | {"odometer": False},
        "overall_severity": severity,
    }


# ------------------------------------------------------------------------------------------------
# Fraud profiles → DMN context
# ------------------------------------------------------------------------------------------------

MEDIUM_POOL = ["FR-04", "FR-05", "FR-06", "FR-09", "FR-11", "FR-12", "FR-13", "FR-10", "FR-03"]
HIGH_COMBOS = [["FR-01", "FR-02", "FR-03"], ["FR-07", "FR-02", "FR-06", "FR-11"], ["FR-08", "FR-09"],
               ["FR-15", "FR-03", "FR-11", "FR-12", "FR-14"], ["FR-01", "FR-07", "FR-11"], ["FR-02", "FR-03", "FR-07"]]


def sample_rules(profile: str, vtype: str) -> set[str]:
    if profile == "clean":
        rules = set()
        if rng.random() < 0.10:
            rules.add("FR-12")
        if rng.random() < 0.08:
            rules.add("FR-06w")
        if rng.random() < 0.06:
            rules.add("FR-14")
        return rules
    if profile == "medium":
        while True:
            rules = set(rng.sample(MEDIUM_POOL, k=rng.randint(2, 3)))
            if vtype != "Car":
                rules.discard("FR-13")
            pts = sum({"FR-03": 20, "FR-10": 20, "FR-12": 10}.get(r, 15) for r in rules)
            if 30 <= pts <= 55:
                return rules
    return set(rng.choice(HIGH_COMBOS))


def fraud_context(rules: set[str], *, variance: float, evidence: dict | None = None) -> dict:
    return {
        "location_contradiction": "FR-01" in rules, "pre_existing_confidence": 0.86 if "FR-02" in rules else 0.1,
        "narrative_consistent": "FR-03" not in rules, "narrative_confidence": 0.74 if "FR-03" in rules else 0.9,
        "od_claims_12m": 2 if "FR-04" in rules else 0, "early_claim": "FR-05" in rules, "garage_variance_pct": variance,
        "network_link": "FR-07" in rules, "blacklisted_or_stolen": "FR-08" in rules, "owner_mismatch": "FR-09" in rules,
        "invalid_dl": "FR-10" in rules, "photo_metadata_mismatch": "FR-11" in rules, "late_intimation": "FR-12" in rules,
        "commercial_use": "FR-13" in rules, "unwitnessed_night": "FR-14" in rules,
        "tampering_confidence": 0.78 if "FR-15" in rules else 0.0, "evidence": evidence or {},
    }


GENERIC_EVIDENCE = {
    "FR-01": "FASTag shows the vehicle at a toll plaza 60 km away within 45 minutes of the reported incident.",
    "FR-02": "Oxidation on the fracture edges of the damaged part indicates damage older than the incident.",
    "FR-03": "Impact pattern is on the opposite side to the one described in the narrative.",
    "FR-04": "IIB shows 2 own-damage claims on this vehicle with other insurers in the last 12 months.",
    "FR-05": "Incident occurred within 30 days of policy inception.",
    "FR-06": "Garage quote is above the AI estimate beyond the tolerance band.",
    "FR-07": "Garage and claimant phone number appear on 2 other high-risk claims in the last 180 days.",
    "FR-08": "Vahan shows the vehicle flagged as blacklisted.",
    "FR-09": "RC owner name does not match the policyholder and there is no transfer record.",
    "FR-10": "Driving licence expired before the incident date.",
    "FR-11": "Photo EXIF timestamps are 3 days before the reported incident.",
    "FR-12": "Claim intimated more than 7 days after the incident.",
    "FR-13": "FASTag pattern shows daily commercial-lane usage for a private vehicle.",
    "FR-14": "Single-vehicle incident between 23:00 and 05:00 with no witness.",
    "FR-15": "Font and alignment irregularities detected on the uploaded RC copy.",
}


# ------------------------------------------------------------------------------------------------
# Status, decision, timeline
# ------------------------------------------------------------------------------------------------

OPEN = {"PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION"}


def choose_status(band: str, age_days: float, claim_type: str, total_loss: bool) -> str:
    """Status by risk band and age. Open statuses only occur on recent claims (realistic queues: SIU ≤ 45 days,
    handler review / info requests ≤ 60 days); older claims are closed."""
    if total_loss or claim_type == "Theft":
        if age_days < 14:
            return weighted([("UNDER_REVIEW", 5), ("INFO_REQUESTED", 4)])
        return weighted([("SETTLED", 16), ("DECLINED", 2), ("WITHDRAWN", 1)])
    if band == "high":
        if age_days < 90:
            return weighted([("SIU_INVESTIGATION", 7), ("UNDER_REVIEW", 1), ("FRAUD_CONFIRMED", 2)])
        return weighted([("FRAUD_CONFIRMED", 55), ("DECLINED", 22), ("SETTLED", 23)])
    if band == "medium":
        if age_days < 14:
            return weighted([("UNDER_REVIEW", 5), ("INFO_REQUESTED", 4), ("APPROVED", 1)])
        if age_days < 75:
            return weighted([("SETTLED", 34), ("APPROVED", 10), ("DECLINED", 14), ("UNDER_REVIEW", 20), ("INFO_REQUESTED", 17), ("WITHDRAWN", 5)])
        return weighted([("SETTLED", 56), ("APPROVED", 4), ("DECLINED", 24), ("FRAUD_CONFIRMED", 10), ("WITHDRAWN", 6)])
    if age_days < 0.05:
        return "PROCESSING"
    if age_days < 1:
        return weighted([("PROCESSING", 2), ("PREAUTH_ISSUED", 5), ("APPROVED", 2)])
    if age_days < 12:
        return weighted([("PREAUTH_ISSUED", 32), ("APPROVED", 22), ("SETTLED", 20), ("INFO_REQUESTED", 14), ("UNDER_REVIEW", 6), ("PROCESSING", 6)])
    if age_days < 60:
        return weighted([("SETTLED", 66), ("APPROVED", 10), ("PREAUTH_ISSUED", 6), ("INFO_REQUESTED", 8), ("UNDER_REVIEW", 5), ("DECLINED", 5)])
    return weighted([("SETTLED", 68), ("APPROVED", 4), ("PREAUTH_ISSUED", 2), ("DECLINED", 11), ("WITHDRAWN", 5), ("FRAUD_CONFIRMED", 6)])


def agent_steps(start: datetime, total_s: int, fraud: dict, checks: dict, damage: dict, channel: str) -> list[dict]:
    marks = sorted(rng.sample(range(3, total_s), 6)) + [total_s]
    texts = [
        ("agent:intake", "intake_complete", f"FNOL structured from {channel} message"),
        ("agent:document", "documents_read", "RC, driving licence and policy read"),
        ("agent:verification", "checks_complete", f"Vahan, FASTag and IIB checks complete ({sum(1 for c in checks.values() if c['level'] == 'pass')} of {len(checks)} passed)"),
        ("agent:damage", "damage_assessed", f"{len(damage['items'])} damaged part(s) assessed · {damage['overall_severity']} severity"),
        ("agent:fraud", "risk_scored", f"Risk score {fraud['score']} ({fraud['band']})"),
        ("agent:adjudication", "recommendation", "Recommendation prepared"),
        ("agent:communication", "customer_notified", "Customer update drafted and sent"),
    ]
    return [{"ts": iso(start + timedelta(seconds=s)), "actor": a, "type": t, "text": x} for s, (a, t, x) in zip(marks, texts)]


SAFE_MSG = {
    "PROCESSING": "We've received your claim {id} and are reviewing it now. We'll update you shortly.",
    "PREAUTH_ISSUED": "Good news! Cashless pre-approval for claim {id} has been issued to {garage}.",
    "APPROVED": "Your claim {id} has been approved for ₹{amount}. We'll confirm payment shortly.",
    "SETTLED": "Payment of ₹{amount} for claim {id} has been completed.",
    "INFO_REQUESTED": "We need a little more information to process claim {id}. Please share the requested details.",
    "UNDER_REVIEW": "Your claim {id} is with our claims team for a final check. We'll update you within 48 hours.",
    "SIU_INVESTIGATION": "Additional verification is in progress for claim {id}. We'll be in touch soon.",
    "DECLINED": "We're sorry — claim {id} could not be approved. Our team will call you to explain the details.",
    "FRAUD_CONFIRMED": "We're sorry — claim {id} could not be approved. Our team will call you to explain the details.",
    "WITHDRAWN": "Claim {id} has been withdrawn as requested.",
}

HANDLERS = ["u_001", "u_002"]


def inr(n: float) -> str:
    s = str(int(round(n)))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return ",".join(([head] if head else []) + groups) + "," + tail


# ------------------------------------------------------------------------------------------------
# Claim builder
# ------------------------------------------------------------------------------------------------

def build_claim(*, customer: dict, vehicle: dict, policy: dict, garage: dict, created: datetime, incident_type: str,
                claim_type: str, severity: str, channel: str, rules: set[str], items: list[dict] | None = None,
                variance: float | None = None, status: str | None = None, incident_at: datetime | None = None,
                narrative: str | None = None, narrative_original: str | None = None, language: str | None = None,
                place: str | None = None, third_party: bool | None = None, evidence: dict | None = None,
                checks_override: dict | None = None, pre_existing: list[dict] | None = None,
                narrative_check: dict | None = None, recommended: str | None = None, decision_reasons: list[str] | None = None,
                fir: dict | None = None, scenario_id: str | None = None, salvage_pct: float = 0.20,
                front_impact: bool | None = None, photos: list[dict] | None = None, unique: bool = False) -> dict:
    vtype = vehicle["type"]
    city = customer["city"] if customer["city"] in CITY else "Pune"
    place = place or place_for(city)
    other = rng.choice(OTHERS)
    age_days = (NOW - created).total_seconds() / 86400

    # --- incident timing (consistent with FR-12 late intimation and FR-14 night rules) ---
    if incident_at is None:
        if "FR-12" in rules:
            incident_at = created - timedelta(days=rng.randint(8, 20), hours=rng.randint(0, 10))
        else:
            incident_at = created - timedelta(minutes=rng.randint(20, 60 * 30))
        hour = rng.randint(23, 27) % 24 if "FR-14" in rules else rng.randint(7, 21)
        incident_at = incident_at.replace(hour=hour, minute=rng.randint(0, 59))
        if incident_at >= created:
            incident_at -= timedelta(days=1)
    if third_party is None:
        third_party = incident_type in ("rear_end", "front_collision", "side_swipe") and "FR-14" not in rules

    # --- photos first: damage items, annotation boxes and the vehicle colour all follow from them ---
    photo_vtype = "Car" if claim_type == "TP" else vtype
    clean_photo = PICKER.clean_for(vtype, vehicle["model_key"])
    if photos is None:
        photos = [] if incident_type == "theft" else PICKER.for_claim(
            photo_vtype, incident_type, model_key=vehicle["model_key"] if claim_type != "TP" else None, unique=unique,
            parts={i["part_code"].rsplit("-", 1)[-1] for i in items} if items else None,
            colour=PHOTO_COLOUR.get(vehicle["id"]), allow_pre_existing="FR-02" in rules)
    if photos and claim_type != "TP" and photos[0].get("colour"):
        vehicle["colour"] = PHOTO_COLOUR.setdefault(vehicle["id"], photos[0]["colour"])

    # --- damage + costing ---
    age_months = max(1, int((incident_at - datetime.fromisoformat(vehicle["registered_on"]).replace(tzinfo=IST)).days / 30.4))
    ctx = costing.VehicleContext(
        segment=vehicle["segment"], vehicle_type=vtype, cc=vehicle["cc"], age_months=age_months,
        zero_dep=policy["add_ons"].get("zero_dep", False), consumables=policy["add_ons"].get("consumables", False),
        metallic=vehicle["colour"] in ("Silver", "Grey", "Blue", "Brown"), city_tier=CITY[city]["tier"],
        garage_type=garage["type"], idv=policy["idv"], voluntary_deductible=policy["voluntary_deductible"],
        salvage_pct=salvage_pct, apply_deductible=claim_type != "TP",
    )
    shown = photos or ([clean_photo] if clean_photo and incident_type == "theft" else [])
    media = []
    for i, ph in enumerate(shown):
        captured = incident_at + timedelta(minutes=rng.randint(5, 50))
        if "FR-11" in rules:
            captured = incident_at - timedelta(days=rng.randint(2, 5))
        if incident_type == "theft":  # the customer's own photo of the vehicle, taken before it was stolen
            captured = incident_at - timedelta(days=rng.randint(20, 300))
        entry = SM.media_entry(ph, f"m_{i + 1}", "overall" if incident_type == "theft" else ph["view"])
        media.append(entry | {
            "uploaded_at": iso(created + timedelta(seconds=rng.randint(5, 90) + 20 * i)), "size_kb": file_kb(ph["url"]),
            "caption": "Vehicle photo shared by the customer (before the theft)" if incident_type == "theft" else None,
            "exif": {"captured_at": iso(captured), "lat": round(CITY[city]["lat"] + rng.uniform(-.05, .05), 4),
                     "lng": round(CITY[city]["lng"] + rng.uniform(-.05, .05), 4), "device": rng.choice(["Pixel 8", "Galaxy A54", "iPhone 14", "Redmi Note 13", "OnePlus Nord"])},
            "quality": {"blur_score": round(rng.uniform(120, 260), 1), "brightness": round(rng.uniform(.4, .7), 2), "ok": True},
        })
    photo_ids = [m["id"] for m in media]

    if claim_type == "Theft":
        financials = costing.theft_settlement(ctx)
        damage = {"items": [], "pre_existing": [], "narrative_consistency": {"consistent": True, "explanation": "Not applicable for theft.", "confidence": 0.9},
                  "photo_coverage": {}, "overall_severity": "severe"}
        garage_quote = None
    else:
        if claim_type == "TP":
            tp_model = rng.choice(MODELS_BY_TYPE["Car"])
            ctx = costing.VehicleContext(**{**ctx.__dict__, "segment": tp_model["segment"], "vehicle_type": "Car", "cc": tp_model["cc"]})
            prefix = tp_model["key"]
            items = items or SM.items_from_photos(photos, prefix, reference.load().parts, severity) or                 pick_items(incident_type if incident_type in ("rear_end", "front_collision", "side_swipe") else "rear_end", "Car", severity, catalogue_prefix=prefix)
        else:
            items = items or SM.items_from_photos(photos, vehicle["model_key"], reference.load().parts, severity) or                 pick_items(incident_type, vtype, severity, catalogue_prefix=vehicle["model_key"])
        base = costing.calculate_cost(items, ctx, front_impact=bool(front_impact if front_impact is not None else incident_type == "front_collision"))
        if variance is None:
            if "FR-06" in rules:
                variance = rng.uniform(31, 48)
            elif "FR-06w" in rules:
                variance = rng.uniform(16, 28)
            else:
                variance = rng.uniform(-4, 13)
        garage_quote = round(base["assessed_loss"] * (1 + variance / 100), -1)
        financials = costing.calculate_cost(items, ctx, front_impact=bool(front_impact if front_impact is not None else incident_type == "front_collision"),
                                            garage_quote=garage_quote)
        variance = financials["variance_pct"]
        damage = damage_block(items, severity, media, photos, overquote="FR-06" in rules, pre_existing=pre_existing or (
            [{"part": reference.load().parts[items[0]["part_code"]]["part"], "evidence": GENERIC_EVIDENCE["FR-02"], "confidence": 0.86, "photo_ids": photo_ids[:1]}]
            if "FR-02" in rules else []),
            narrative=narrative_check or ({"consistent": False, "explanation": GENERIC_EVIDENCE["FR-03"], "confidence": 0.74} if "FR-03" in rules else None))
    financials["ncb_impact"] = {"current_pct": policy["ncb_pct"], "after_claim_pct": 0 if claim_type in ("OD", "Total loss") else policy["ncb_pct"]}
    is_total_loss = financials["total_loss_check"]["is_total_loss"] and claim_type != "Theft"
    if is_total_loss:
        claim_type = "Total loss"

    # --- fraud (DMN computes the score; seed only supplies observations) ---
    dmn_rules = {r.replace("FR-06w", "FR-06") for r in rules}
    ev = {rid: GENERIC_EVIDENCE[rid] for rid in dmn_rules} | (evidence or {})
    if "FR-06" in dmn_rules and variance is not None:
        ev["FR-06"] = f"Garage quote ₹{inr(garage_quote)} is {variance:.1f}% above the AI estimate of ₹{inr(financials['assessed_loss'])}."
    fraud = dmn_engine.evaluate_fraud(fraud_context(dmn_rules, variance=variance or 0, evidence=ev))
    fraud = {k: fraud[k] for k in ("score", "band", "hard_stop", "fired", "not_fired")} | {
        "network_links": [], "narrative": "No risk indicators found." if not fraud["fired"] else
        "Risk indicators: " + "; ".join(f["name"] for f in fraud["fired"]) + "."}

    # --- checks ---
    def chk(level, summary, latency):
        return {"level": level, "summary": summary, "data": {}, "latency_ms": latency}
    checks = {
        "policy": chk("warn" if "FR-05" in dmn_rules else "pass",
                      f"Active · {policy['cover']} · valid till {datetime.fromisoformat(policy['end']).strftime('%d %b %Y')}"
                      + (" · incident within 30 days of inception" if "FR-05" in dmn_rules else ""), rng.randint(80, 200)),
        "vahan": chk("fail" if "FR-08" in dmn_rules else ("warn" if "FR-09" in dmn_rules else "pass"),
                     "Vehicle flagged as blacklisted" if "FR-08" in dmn_rules else ("RC owner differs from policyholder" if "FR-09" in dmn_rules
                     else f"RC active · {vehicle['use'].title()} · not blacklisted"), rng.randint(250, 600)),
        "dl": chk("fail" if "FR-10" in dmn_rules else "pass", "Licence expired before incident date" if "FR-10" in dmn_rules
                  else f"Valid · {'MCWG' if vtype == '2W' else ('TRANS' if vtype == 'CV' else 'LMV')}", rng.randint(200, 450)),
        "fastag": chk("fail" if "FR-01" in dmn_rules else ("warn" if "FR-13" in dmn_rules else ("pending" if vtype == "2W" else "pass")),
                      GENERIC_EVIDENCE["FR-01"] if "FR-01" in dmn_rules else ("Commercial-lane usage pattern" if "FR-13" in dmn_rules else
                      ("Not applicable for two-wheelers" if vtype == "2W" else "No contradicting toll or parking events")), rng.randint(300, 700)),
        "iib": chk("warn" if "FR-04" in dmn_rules else "pass", "2 OD claims in last 12 months" if "FR-04" in dmn_rules
                   else f"{rng.choice([0, 0, 1])} claims in 3 years", rng.randint(250, 500)),
        "police": chk("pass" if fir else "pending", f"FIR {fir['number']} verified" if fir else "Not required", rng.randint(200, 400) if fir else 0),
        "kyc": chk("pass", "KYC verified", rng.randint(60, 120)),
    } | (checks_override or {})

    # --- status & decision ---
    route = fraud["band"] if fraud["band"] != "low" else "auto"
    route = {"high": "SIU", "medium": "handler", "auto": "auto"}[route]
    if is_total_loss or claim_type == "Theft":
        route = "handler" if route == "auto" else route
    explicit_status = status is not None
    status = status or choose_status(fraud["band"], age_days, claim_type, is_total_loss)
    ai_seconds = rng.randint(32, 58)
    pipeline_end = created + timedelta(seconds=ai_seconds)
    auto = route == "auto" and status in {"PREAUTH_ISSUED", "APPROVED", "SETTLED"} and financials["net_payable"] <= 150_000
    if status in {"APPROVED", "PREAUTH_ISSUED", "SETTLED", "DECLINED", "FRAUD_CONFIRMED", "WITHDRAWN"}:
        decided_at = pipeline_end if auto else pipeline_end + timedelta(hours=rng.uniform(5, 30) if fraud["band"] != "high" else rng.uniform(72, 400))
        if decided_at > NOW:
            # The decision would lie in the future: the claim is still waiting for it (scenarios keep their status).
            if explicit_status:
                decided_at = NOW - timedelta(minutes=5)
            else:
                status, decided_at, auto = ("UNDER_REVIEW" if route != "auto" else "PROCESSING"), None, False
    else:
        decided_at = None
    settle_delay = timedelta(days=rng.uniform(2, 9))
    if status == "SETTLED" and decided_at and decided_at + settle_delay > NOW and not explicit_status:
        status = "APPROVED"  # approved, payment not yet released
    approved_amount = financials["net_payable"] if status in {"APPROVED", "PREAUTH_ISSUED", "SETTLED"} else None
    rec = recommended or {"auto": "approve", "handler": "approve_revised" if "FR-06" in dmn_rules else "review", "SIU": "escalate_siu"}[route]
    decision = {
        "route": route, "recommended_action": rec, "auto": auto, "confidence": round(rng.uniform(0.82, 0.96), 2),
        "reasons": decision_reasons or ([f["name"] for f in fraud["fired"]] or ["All verification checks passed", "Damage consistent with narrative"]),
        "final_action": {"APPROVED": "approve", "PREAUTH_ISSUED": "approve", "SETTLED": "approve", "DECLINED": "reject",
                         "FRAUD_CONFIRMED": "reject", "WITHDRAWN": "withdrawn"}.get(status),
        "decided_by": ("agent:adjudication" if auto else rng.choice(HANDLERS)) if decided_at else None,
        "decided_at": iso(decided_at) if decided_at else None, "approved_amount": approved_amount,
        "info_request": ({"items": ["Original keys (all sets)", "RTO non-use declaration (Form 26)"] if claim_type == "Theft"
                          else rng.sample(["Odometer photo", "Close-up photo of the damaged area", "Repair estimate from garage",
                                           "Driving licence (back side)", "FIR copy"], k=2), "requested_at": iso(min(pipeline_end + timedelta(minutes=rng.randint(1, 600)), NOW - timedelta(minutes=rng.randint(5, 30))))}
                         if status == "INFO_REQUESTED" else None),
    }

    # --- narrative ---
    if narrative is None:
        narrative = rng.choice(STORIES[incident_type]).format(place=place, other=other)
        if language is None:
            language = "hi-en" if incident_type in HINGLISH and rng.random() < 0.35 else "en"
        narrative_original = HINGLISH[incident_type].format(place=place, other=other) if language == "hi-en" else narrative
    language = language or "en"
    narrative_original = narrative_original or narrative
    incident = {
        "type": incident_type, "label": INCIDENTS[incident_type]["label"], "datetime": iso(incident_at), "reported_at": iso(created),
        "location": {"text": place, "city": city, "lat": round(CITY[city]["lat"] + rng.uniform(-.04, .04), 4),
                     "lng": round(CITY[city]["lng"] + rng.uniform(-.04, .04), 4)},
        "narrative_original": narrative_original, "narrative_language": language, "narrative_en": narrative,
        "cause": INCIDENTS[incident_type]["label"] + (f" with a {other}" if third_party else ""),
        "third_party_involved": bool(third_party), "injuries": False, "fir": fir,
        "damaged_parts_mentioned": [i["part"].lower() for i in damage["items"][:3]],
    }

    # --- voice note: scenarios point at the recorded file (README in assets/audio/scenarios); other voice FNOLs keep the
    # transcript only. The API reports whether the audio file is actually present. ---
    if scenario_id or (channel == "whatsapp" and language != "en" and rng.random() < 0.6):
        words = len(narrative_original.split())
        media.append({"id": f"m_{len(media) + 1}", "kind": "audio", "slot": "voice_note",
                      "url": f"/assets/audio/scenarios/{scenario_id}.webm" if scenario_id else None,
                      "duration_s": max(6, round(words / 2.3)), "transcript": narrative_original, "translation_en": narrative,
                      "language": LANGUAGE_LABEL.get(language, language), "language_code": language,
                      "uploaded_at": iso(created + timedelta(seconds=3)), "retained": bool(scenario_id)})

    # --- timeline / audit / communications ---
    timeline = [{"ts": iso(created), "actor": "customer", "type": "fnol_received", "text": f"FNOL received via {'WhatsApp' if channel == 'whatsapp' else channel.title()}"}]
    timeline += agent_steps(created, ai_seconds, fraud, checks, damage, channel)
    audit = [{"ts": iso(created), "actor": "system", "action": "status_change", "from": "SUBMITTED", "to": "PROCESSING", "reason": "AI pipeline started"}]
    if status != "PROCESSING":
        first = {"auto": "PREAUTH_ISSUED" if status in {"PREAUTH_ISSUED", "SETTLED"} else ("APPROVED" if status == "APPROVED" else "UNDER_REVIEW"),
                 "handler": "UNDER_REVIEW", "SIU": "SIU_INVESTIGATION"}[route]
        if status == "INFO_REQUESTED":
            first = "INFO_REQUESTED"
        audit.append({"ts": iso(pipeline_end), "actor": "agent:adjudication", "action": "status_change", "from": "PROCESSING", "to": first,
                      "reason": f"Routed {route} · risk {fraud['score']}"})
        if decided_at and status != first:
            mid = "APPROVED" if status == "SETTLED" and not auto else None
            prev = first
            if mid and mid != prev:
                audit.append({"ts": iso(decided_at), "actor": decision["decided_by"], "action": "status_change", "from": prev, "to": mid, "reason": "Approved after review"})
                timeline.append({"ts": iso(decided_at), "actor": decision["decided_by"], "type": "decision", "text": f"Approved for ₹{inr(approved_amount)}"})
                prev = mid
            final_ts = decided_at + (settle_delay if status == "SETTLED" else timedelta(0))
            final_ts = min(final_ts, NOW - timedelta(minutes=2))  # only scenarios can reach this clamp
            if prev != status:
                audit.append({"ts": iso(final_ts), "actor": "system" if status == "SETTLED" else decision["decided_by"], "action": "status_change",
                              "from": prev, "to": status, "reason": {"SETTLED": "Payment released", "DECLINED": "Not covered under policy terms",
                                                                     "FRAUD_CONFIRMED": "SIU findings confirmed", "WITHDRAWN": "Withdrawn by customer"}.get(status, "Decision recorded")})
                timeline.append({"ts": iso(final_ts), "actor": "system" if status == "SETTLED" else decision["decided_by"], "type": status.lower(),
                                 "text": {"SETTLED": f"₹{inr(approved_amount or 0)} paid", "DECLINED": "Claim declined", "FRAUD_CONFIRMED": "Fraud confirmed by SIU",
                                          "WITHDRAWN": "Claim withdrawn", "APPROVED": "Claim approved", "PREAUTH_ISSUED": "Cashless pre-authorisation issued"}.get(status, status)})
        if status == "INFO_REQUESTED":
            timeline.append({"ts": decision["info_request"]["requested_at"], "actor": "agent:communication", "type": "info_requested",
                             "text": "Requested: " + ", ".join(decision["info_request"]["items"])})
        if status == "UNDER_REVIEW" and route != "auto":
            timeline.append({"ts": iso(pipeline_end + timedelta(minutes=2)), "actor": "agent:adjudication", "type": "assigned", "text": "Assigned to claims handler"})
        if status == "SIU_INVESTIGATION":
            timeline.append({"ts": iso(pipeline_end + timedelta(minutes=1)), "actor": "agent:adjudication", "type": "siu_referral", "text": "Referred to SIU"})
    timeline.sort(key=lambda e: e["ts"])
    updated = max([e["ts"] for e in timeline] + [a["ts"] for a in audit])

    msg_vars = {"amount": inr(approved_amount or financials["net_payable"]), "garage": garage["name"]}
    communications = [{"id": "msg_1", "channel": "whatsapp" if channel == "whatsapp" else "sms", "direction": "outbound", "status": "delivered",
                       "text": "We've received your claim {id}. Our team is on it.", "draft": False, "created_at": iso(created + timedelta(seconds=ai_seconds)),
                       "by": "agent:communication"}]
    if status != "PROCESSING":
        communications.append({"id": "msg_2", "channel": communications[0]["channel"], "direction": "outbound", "status": "delivered",
                               "text": SAFE_MSG[status].replace("₹{amount}", f"₹{msg_vars['amount']}").replace("{garage}", msg_vars["garage"]),
                               "draft": False, "created_at": updated, "by": "agent:communication"})

    sla_hours = {"PROCESSING": 1, "UNDER_REVIEW": 48, "INFO_REQUESTED": 72, "SIU_INVESTIGATION": 2160}.get(status)
    sla_start = datetime.fromisoformat(decision["info_request"]["requested_at"]) if status == "INFO_REQUESTED" else pipeline_end
    sla = {"target_hours": sla_hours or 48, "due_at": iso(sla_start + timedelta(hours=sla_hours)) if sla_hours else None,
           "breached": bool(sla_hours) and NOW > sla_start + timedelta(hours=sla_hours)}

    settlement_mode = "cashless" if garage["cashless"] and claim_type not in ("Theft", "TP") else "reimbursement"
    documents, conditions, licence = SD.documents_for(
        rng=rng, fake=fake, customer=customer, vehicle=vehicle, model=MODELS[vehicle["model_key"]], policy=policy, garage=garage,
        rto=vehicle["registration"][:5], incident_at=incident_at, created=created, claim_type=claim_type, rules=dmn_rules, fir=fir,
        financials=financials, garage_quote=garage_quote, settlement_mode=settlement_mode, status=status, third_party=bool(third_party),
        severity=severity, info_items=(decision.get("info_request") or {}).get("items", []), incident=incident)
    checks["dl"]["data"] = {k: licence[k] for k in ("dl_number", "holder", "classes", "valid_from", "valid_to")}

    m = MODELS[vehicle["model_key"]]
    open_claim = status in OPEN
    return {
        "id": None, "status": status, "created_at": iso(created), "updated_at": updated, "channel": channel,
        "customer_id": customer["id"], "policy_no": policy["policy_no"], "vehicle_id": vehicle["id"], "claim_type": claim_type,
        "incident": incident, "settlement": {"mode": settlement_mode, "garage_id": garage["id"], "bank": None},
        "document_conditions": conditions,
        "media": media, "documents": documents, "checks": checks, "damage": damage, "financials": financials, "fraud": fraud,
        "decision": decision, "communications": communications,
        "assignee": None if route == "auto" and not open_claim else rng.choice(HANDLERS),
        "internal_notes": [], "timeline": timeline, "audit": audit, "pipeline_run_id": None,
        "ai_processing_s": ai_seconds, "sla": sla, "scenario_id": scenario_id,
        "customer_name": customer["name"], "city": city, "garage_name": garage["name"], "registration": vehicle["registration"],
        "vehicle": {"make": m["make"], "model": m["model"], "type": vtype, "segment": m["segment"], "colour": vehicle["colour"],
                    "thumb": (clean_photo or (photos[0] if photos else {})).get("thumb"),
                    "blur_data": (clean_photo or (photos[0] if photos else {})).get("blur_data")},
        "amount_claimed": float(garage_quote if garage_quote is not None else financials["assessed_loss"]),
        "amount_approved": float(approved_amount or 0), "risk_score": fraud["score"], "risk_band": fraud["band"],
    }


# ------------------------------------------------------------------------------------------------
# Scenarios (§14.3) and Rahul's history (§11.3)
# ------------------------------------------------------------------------------------------------

SCENARIO_CUSTOMERS = {
    "c_0001": ("Rahul Sharma", "Pune", "hi-en"), "c_0042": ("Arjun Desai", "Mumbai", "en"), "c_0043": ("Priya Nair", "Kochi", "ml"),
    "c_0044": ("Imran Shaikh", "Pimpri-Chinchwad", "hi"), "c_0045": ("Kavita Joshi", "Thane", "mr"),
}


def garage_in(garages: list[dict], city: str, *, network: bool = True, type_: str | None = None) -> dict:
    pool = [g for g in garages if g["city"] == city and (not network or g["cashless"]) and (not type_ or g["type"] == type_)]
    return pool[0] if pool else next(g for g in garages if g["city"] == "Pune")


# Curated best-match photos per demo scenario (stock_curation.py ids); none of them is used by any other
# scenario or showcase claim.
SCENARIO_PHOTOS = {
    "clean_rear_end": ["car_rear_02", "car_rear_02c"],       # rear bumper + boot lid, plus a close-up of the same car
    "fastag_mismatch": ["car_front_13", "car_front_05"],     # front-corner damage + oxidised bracket fracture (pre-existing)
    "garage_overquote": ["car_side_04", "car_side_04c"],     # left doors dented, plus a close-up of the same car
    "flood_total_loss": ["flood_01", "flood_02"],            # car standing in flood water
}


def scenario_photos(sid: str) -> list[dict] | None:
    photos = PICKER.take_ids(SCENARIO_PHOTOS.get(sid, []))
    return photos or None


def scenario_claims(customers: dict, garages: list[dict], vehicles: list, policies: list) -> list[dict]:
    out = []
    no_addons = {"zero_dep": False, "consumables": False, "engine_protect": False, "rti": False, "rsa": True}

    def setup(cid, vid, model_key, reg, age_months, colour, incident_at, idv=None):
        v = make_vehicle(vid, model_key, customers[cid]["city"], age_months, reg=reg, colour=colour)
        v["registered_on"] = (incident_at - timedelta(days=int(age_months * 30.4) + 5)).date().isoformat()
        p = make_policy(customers[cid], v, incident_at, idv=idv, add_ons=dict(no_addons))
        p["voluntary_deductible"] = 0
        vehicles.append(v)
        policies.append(p)
        return v, p

    # 1. clean_rear_end — Rahul's Creta rear-ended by a truck near Khed Shivapur toll → auto pre-auth.
    t = (NOW - timedelta(days=3)).replace(hour=21, minute=4)
    v, p = setup("c_0001", "v_0001", "HYU-CRE", "MH 12 AB 1234", 28, "Pearl White", t)
    out.append(build_claim(
        customer=customers["c_0001"], vehicle=v, policy=p, garage=garage_in(garages, "Pune", type_="authorised"), created=t + timedelta(minutes=37),
        incident_type="rear_end", claim_type="OD", severity="moderate", channel="whatsapp", rules={"FR-06w"},
        items=[{"part_code": "HYU-CRE-RBMP", "operation": "replace"}, {"part_code": "HYU-CRE-TLGT", "operation": "replace"}],
        variance=18.0, status="PREAUTH_ISSUED", incident_at=t, place="NH48 near Khed Shivapur toll plaza", third_party=True, language="hi-en",
        narrative="A truck hit my car from behind on NH48 near the Khed Shivapur toll at around 9 PM. The rear bumper and tailgate are damaged.",
        narrative_original="Khed Shivapur toll ke paas NH48 pe raat 9 baje ek truck ne peeche se thok diya. Peeche ka bumper aur dikki dono damage ho gaye.",
        checks_override={"fastag": {"level": "pass", "summary": "Khed Shivapur toll at 20:52 — matches the reported route and time", "data": {}, "latency_ms": 410}},
        scenario_id="clean_rear_end", photos=scenario_photos("clean_rear_end")))

    # 2. fastag_mismatch — "hit a divider at 2 AM"; FASTag puts the car in Andheri → SIU.
    t = (NOW - timedelta(days=1)).replace(hour=2, minute=0)
    v, p = setup("c_0042", "v_0042", "HYU-CRE", "MH 12 XX 4521", 31, "Silver", t)
    out.append(build_claim(
        customer=customers["c_0042"], vehicle=v, policy=p, garage=garage_in(garages, "Mumbai", network=False), created=t + timedelta(minutes=41),
        incident_type="front_collision", claim_type="OD", severity="severe", channel="whatsapp", rules={"FR-01", "FR-02", "FR-03", "FR-14"},
        items=[{"part_code": "HYU-CRE-FBMP", "operation": "replace"}, {"part_code": "HYU-CRE-HLED", "operation": "replace"},
               {"part_code": "HYU-CRE-BMRF", "operation": "replace"}],
        variance=9.0, status="SIU_INVESTIGATION", incident_at=t, place="Mumbai–Pune Expressway near Khalapur", third_party=False,
        narrative="Hit a divider on the Mumbai–Pune Expressway at 2 AM.", language="en",
        narrative_original="I hit a divider on the Mumbai–Pune Expressway near Khalapur at about 2 AM. The front bumper and the left headlamp are broken.",
        evidence={"FR-01": "FASTag: vehicle in Andheri mall parking 01:30–03:00; no expressway toll in the 24 hours around the incident.",
                  "FR-02": "Orange-brown oxidation on the bumper bracket fracture edges — damage predates the incident.",
                  "FR-03": "Front-corner impact with no divider scrape marks along the side; inconsistent with the described divider impact."},
        checks_override={"fastag": {"level": "fail", "summary": "Vehicle at Andheri mall parking 01:30–03:00; no expressway toll in 24 h", "data": {}, "latency_ms": 410}},
        pre_existing=[{"part": "Bumper inner bracket", "evidence": "Orange-brown oxidation on fracture edges", "confidence": 0.89, "photo_ids": ["m_2"]}],
        narrative_check={"consistent": False, "explanation": "Damage is concentrated on the front corner with no divider scrape marks along the side, and the bracket fracture is corroded — not consistent with a fresh divider impact.", "confidence": 0.71},
        scenario_id="fastag_mismatch", photos=scenario_photos("fastag_mismatch")))

    # 3. garage_overquote — Baleno pillar scrape in Kochi; garage quote 34% above → handler, approve revised.
    t = (NOW - timedelta(days=4)).replace(hour=23, minute=40)
    v, p = setup("c_0043", "v_0043", "MAR-BAL", "KL 07 CD 5512", 22, "Blue", t)
    out.append(build_claim(
        customer=customers["c_0043"], vehicle=v, policy=p, garage=garage_in(garages, "Kochi", network=False, type_="multibrand"), created=t + timedelta(hours=10),
        incident_type="parking_scrape", claim_type="OD", severity="moderate", channel="app", rules={"FR-06", "FR-04", "FR-14"},
        items=[{"part_code": "MAR-BAL-FDOR", "operation": "repair_moderate_dent"}, {"part_code": "MAR-BAL-RDOR", "operation": "repair_minor_dent"},
               {"part_code": "MAR-BAL-ORVM", "operation": "replace"}],
        variance=34.0, status="UNDER_REVIEW", incident_at=t, place="basement parking, Lulu Mall, Edappally", third_party=False, language="ml",
        narrative_original="എടപ്പള്ളി ലുലു മാളിന്റെ ബേസ്‌മെന്റ് പാർക്കിങ്ങിൽ തിരിക്കുമ്പോൾ ഒരു തൂണിൽ ഉരസി. ഇടതുവശത്തെ ഡോറുകൾക്കും മിററിനും കേടുപാട് പറ്റി.",
        narrative="Scraped a pillar while turning in the basement parking at Lulu Mall, Edappally. Left doors and mirror damaged.",
        recommended="approve_revised", decision_reasons=["Damage is genuine and consistent", "Garage quote 34% above AI estimate", "Approve at AI-assessed amount"],
        scenario_id="garage_overquote", photos=scenario_photos("garage_overquote")))

    # 4. theft_two_wheeler — Activa stolen in Pimpri; FIR present, keys pending → info requested.
    t = (NOW - timedelta(days=12)).replace(hour=19, minute=30)
    v, p = setup("c_0044", "v_0044", "HON-ACT", "MH 14 EF 7788", 20, "Grey", t)
    fir = {"number": "PMP/1129/2026", "station": "Pimpri Police Station", "date": (t + timedelta(days=1)).date().isoformat()}
    out.append(build_claim(
        customer=customers["c_0044"], vehicle=v, policy=p, garage=garage_in(garages, "Pimpri-Chinchwad"), created=t + timedelta(days=9),
        incident_type="theft", claim_type="Theft", severity="severe", channel="whatsapp", rules={"FR-12"}, status="INFO_REQUESTED",
        incident_at=t, place="outside Pimpri vegetable market", third_party=False, fir=fir,
        narrative="Parked my Activa outside Pimpri vegetable market at 7:30 PM; it was missing when I came back. FIR filed the next day.",
        language="hi", narrative_original="मैंने अपनी एक्टिवा शाम साढ़े सात बजे पिंपरी सब्ज़ी मंडी के बाहर पार्क की थी; वापस आया तो गाड़ी गायब थी। अगले दिन FIR दर्ज कराई।",
        scenario_id="theft_two_wheeler"))

    # 5. flood_total_loss — Swift submerged in Thane flooding → assessed > 75% IDV → total loss, handler.
    t = (NOW - timedelta(days=5)).replace(hour=4, minute=15)
    v, p = setup("c_0045", "v_0045", "MAR-SWI", "MH 04 GH 3301", 104, "Red", t, idv=150_000)
    flood_items = [{"part_code": f"MAR-SWI-{c}", "operation": "replace"} for c in
                   ("FBMP", "RBMP", "BATT", "RADI", "CNDS", "HLMP", "HLMP", "TLMP", "TLMP", "FDOR", "FDOR", "RDOR", "RDOR", "AIRB", "AIRB", "FNDR", "FNDR", "TLGT")]
    out.append(build_claim(
        customer=customers["c_0045"], vehicle=v, policy=p, garage=garage_in(garages, "Thane", type_="authorised"), created=t + timedelta(hours=6),
        incident_type="flood", claim_type="OD", severity="severe", channel="branch", rules=set(), items=flood_items, variance=4.0,
        status="UNDER_REVIEW", incident_at=t, place="Vandana Cinema underpass, Thane West", third_party=False, salvage_pct=0.18,
        narrative="The car was parked near the Vandana underpass when overnight rain flooded the area; water reached the dashboard.",
        decision_reasons=["Assessed loss exceeds 75% of IDV", "Total loss path — salvage computed", "Handler review required"],
        recommended="approve_total_loss", scenario_id="flood_total_loss", photos=scenario_photos("flood_total_loss"), language="mr",
        narrative_original="रात्रभर पडलेल्या पावसामुळे वंदना अंडरपासजवळ पाणी साचलं. माझी गाडी तिथेच पार्क होती आणि पाणी डॅशबोर्डपर्यंत पोहोचलं."))

    # Rahul's history: 1 settled (14 months ago), 1 info requested (recent windshield).
    t = (NOW - timedelta(days=430)).replace(hour=18, minute=10)
    p_old = make_policy(customers["c_0001"], vehicles[0], t, add_ons=dict(no_addons))
    policies.append(p_old)
    out.append(build_claim(
        customer=customers["c_0001"], vehicle=vehicles[0], policy=p_old, garage=garage_in(garages, "Pune", type_="authorised"),
        created=t + timedelta(hours=3), incident_type="side_swipe", claim_type="OD", severity="minor", channel="app", rules=set(),
        items=[{"part_code": "HYU-CRE-FDOR", "operation": "repair_minor_dent"}, {"part_code": "HYU-CRE-ORVM", "operation": "replace"}],
        variance=5.0, status="SETTLED", incident_at=t, place="Baner Road near Balewadi High Street", unique=True))
    t = (NOW - timedelta(days=6)).replace(hour=11, minute=20)
    out.append(build_claim(
        customer=customers["c_0001"], vehicle=vehicles[0], policy=policies[0], garage=garage_in(garages, "Pune", type_="authorised"),
        created=t + timedelta(hours=1), incident_type="glass", claim_type="Glass", severity="minor", channel="whatsapp", rules=set(),
        items=[{"part_code": "HYU-CRE-WSCR", "operation": "replace"}], variance=3.0, status="INFO_REQUESTED", incident_at=t,
        place="Mumbai–Pune Expressway near Lonavala", unique=True))
    return out


# ------------------------------------------------------------------------------------------------
# Main generation
# ------------------------------------------------------------------------------------------------

SEASON = {1: 1.0, 2: 0.7, 3: 0.9, 4: 0.9, 5: 1.0, 6: 1.1, 7: 1.5, 8: 1.55, 9: 1.45, 10: 1.3, 11: 1.3, 12: 1.0}


def month_starts() -> list[datetime]:
    first = NOW.replace(day=1, hour=0, minute=0)
    out = []
    y, m = first.year, first.month
    for _ in range(24):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        out.append(datetime(y, m, 1, tzinfo=IST))
    return sorted(out)


def random_time_in_month(start: datetime) -> datetime:
    nxt = (start + timedelta(days=32)).replace(day=1)
    end = min(nxt, NOW - timedelta(hours=1))
    span = (end - start).total_seconds()
    return start + timedelta(seconds=rng.uniform(0, span))


def generate() -> dict:
    garages = seed_garages()
    customers = {cid: make_customer(cid, *vals[:2], vals[2]) for cid, vals in SCENARIO_CUSTOMERS.items()}
    customers["c_0001"].update({"phone": "+91 98765 43210", "email": "rahul.sharma@example.com"})
    vehicles, policies = [], []
    claims = scenario_claims(customers, garages, vehicles, policies)

    # Historic + current-month + today's claims.
    months = month_starts() + [NOW.replace(day=1, hour=0, minute=0)]
    # Seasonality × business growth (book grows ~2.5× over 24 months; the last two months are busiest).
    weights = [SEASON[m.month] * (0.55 + 1.0 * (i / len(months)) ** 2) * (1.9 if i >= len(months) - 3 else 1) for i, m in enumerate(months)]
    weights[-1] *= min(1.0, (NOW - months[-1]).days / 30)  # current month is only partly elapsed
    target = 250 - len(claims) - 7
    created_times = [random_time_in_month(rng.choices(months, weights=weights)[0]) for _ in range(target)]
    today_start = NOW.replace(hour=0, minute=30)
    created_times += [today_start + (NOW - today_start) * rng.uniform(0.05, 0.98) if NOW > today_start else NOW - timedelta(minutes=rng.randint(5, 300))
                      for _ in range(7)]

    # Showcase claims (the 30 most recent — what Home shows first) get photo sets no other showcase/scenario claim uses.
    showcase = set(sorted(created_times)[-30:])
    cid_n = 2
    city_pairs = [(c, d["w"]) for c, d in CITY.items()]
    for created in created_times:
        while f"c_{cid_n:04d}" in customers:
            cid_n += 1
        cid = f"c_{cid_n:04d}"
        cid_n += 1
        city = weighted(city_pairs)
        customers[cid] = make_customer(cid, f"{fake.first_name()} {fake.last_name()}", city)
        vtype = weighted([("Car", 58), ("2W", 32), ("CV", 10)])
        model = weighted([(m["key"], POPULARITY[m["key"]]) for m in MODELS_BY_TYPE[vtype]])
        age = int(min(150, max(3, rng.lognormvariate(3.5, 0.6))))
        vehicle = make_vehicle(f"v_{cid_n:04d}", model, city, age)
        vehicles.append(vehicle)

        if vtype == "2W":
            claim_type = weighted([("OD", 78), ("TP", 8), ("Theft", 14)])
        elif vtype == "CV":
            claim_type = weighted([("OD", 70), ("TP", 22), ("Glass", 8)])
        else:
            claim_type = weighted([("OD", 72), ("TP", 12), ("Theft", 3), ("Glass", 9), ("Total loss", 4)])
        month = created.month
        if claim_type == "Theft":
            incident = "theft"
        elif claim_type == "Glass":
            incident = "glass"
        elif claim_type == "Total loss":
            incident = "flood" if month in (6, 7, 8, 9) else "front_collision"
        elif claim_type == "TP":
            incident = rng.choice(["rear_end", "front_collision", "side_swipe"])
        else:
            pool = {"Car": [("rear_end", 22), ("front_collision", 18), ("side_swipe", 18), ("parking_scrape", 20), ("pothole", 8), ("animal", 5),
                            ("flood", 9 if month in (7, 8, 9) else 1)],
                    "2W": [("skid_fall", 45), ("rear_end", 15), ("front_collision", 20), ("side_swipe", 15), ("animal", 5)],
                    "CV": [("front_collision", 30), ("rear_end", 25), ("side_swipe", 30), ("pothole", 10), ("animal", 5)]}[vtype]
            incident = weighted(pool)
        severity = "severe" if claim_type == "Total loss" else weighted([("minor", 40), ("moderate", 45), ("severe", 15)])
        profile = weighted([("clean", 72), ("medium", 19), ("high", 9)])
        rules = sample_rules(profile, vtype)
        if claim_type == "Theft":
            rules -= {"FR-02", "FR-03", "FR-06", "FR-06w", "FR-11"}
            if profile == "high":
                rules |= {"FR-08"} if rng.random() < .5 else {"FR-01", "FR-07"}
        if claim_type == "TP":
            rules -= {"FR-06w"}
        channel_w = 0.30 + 0.30 * (created - months[0]).days / 730
        channel = weighted([("whatsapp", 46 * channel_w / 0.45), ("app", 28), ("web", 16), ("branch", 10)])
        incident_at = None
        policy = make_policy(customers[cid], vehicle, created - timedelta(days=1), early="FR-05" in rules,
                             idv=None)
        if claim_type == "Total loss":
            # Old, low-IDV vehicle with severe multi-panel damage so the costing engine lands above 75% IDV.
            vehicle["registered_on"] = (created - timedelta(days=int(rng.randint(96, 140) * 30.4))).date().isoformat()
            prefix = vehicle["model_key"]
            codes = [c for c in R.PARTS_BY_TYPE[vtype] if c not in ("BMRF",)]
            items = [{"part_code": f"{prefix}-{c}", "operation": "replace"} for c in rng.sample(codes, k=min(len(codes), 14))]
            ctx_probe = costing.VehicleContext(segment=vehicle["segment"], vehicle_type=vtype, cc=vehicle["cc"], age_months=110)
            assessed = costing.calculate_cost(items, ctx_probe)["assessed_loss"]
            policy["idv"] = int(round(assessed / rng.uniform(0.85, 1.05), -3))
            claim = build_claim(customer=customers[cid], vehicle=vehicle, policy=policy, garage=garage_in(garages, city),
                                created=created, incident_type=incident, claim_type="OD", severity="severe", channel=channel,
                                rules=rules - {"FR-06w"}, items=items, incident_at=incident_at, salvage_pct=rng.uniform(.15, .25),
                                unique=created in showcase)
        else:
            fir = None
            if claim_type == "Theft":
                fir = {"number": f"{rng.randint(100, 2999)}/{created.year}", "station": f"{city} Police Station",
                       "date": (created - timedelta(days=rng.randint(0, 2))).date().isoformat()}
            garage = garage_in(garages, city, network=rng.random() < 0.8)
            claim = build_claim(customer=customers[cid], vehicle=vehicle, policy=policy, garage=garage, created=created,
                                incident_type=incident, claim_type=claim_type, severity=severity, channel=channel, rules=rules, fir=fir,
                                unique=created in showcase)
        policies.append(policy)
        claims.append(claim)

    # IDs by creation order: ABC-MC-<YYYY>-<6-digit global sequence>
    claims.sort(key=lambda c: c["created_at"])
    for n, c in enumerate(claims, start=1):
        c["id"] = f"ABC-MC-{c['created_at'][:4]}-{n:06d}"
        c["pipeline_run_id"] = f"run_{n:06d}"
        for msg in c["communications"]:
            msg["text"] = msg["text"].replace("{id}", c["id"])
        for doc in c["documents"]:
            if doc["extracted"].get("claim_id") == "{id}":
                doc["extracted"]["claim_id"] = c["id"]
    return {"claims": claims, "customers": list(customers.values()), "vehicles": vehicles, "policies": policies, "garages": garages}


def mocks_for(data: dict) -> dict:
    """Vahan / FASTag / IIB / DL / police records consistent with the generated claims."""
    vahan, fastag, iib, dls, police = {}, {}, {}, {}, {}
    cust = {c["id"]: c for c in data["customers"]}
    for v in data["vehicles"]:
        owner = next((p["customer_id"] for p in data["policies"] if p["vehicle_id"] == v["id"]), None)
        vahan[v["registration"]] = {"registration": v["registration"], "owner": cust.get(owner, {}).get("name"), "class": v["type"],
                                    "make_model": f"{v['make']} {v['model']}", "rc_status": "active", "hypothecation": None,
                                    "blacklisted": False, "stolen": False, "registered_on": v["registered_on"]}
    for c in data["claims"]:
        reg = c["registration"]
        if c["checks"]["vahan"]["level"] == "fail":
            vahan[reg]["blacklisted"] = True
        if c["claim_type"] == "Theft" and c["incident"]["fir"]:
            vahan[reg]["stolen"] = True
            police.setdefault(reg, []).append({"type": "stolen_vehicle", **c["incident"]["fir"]})
        events = fastag.setdefault(reg, [])
        if c["scenario_id"] == "clean_rear_end":
            events.append({"ts": c["incident"]["datetime"][:11] + "20:52:00+05:30", "type": "toll", "plaza": "Khed Shivapur", "city": "Pune",
                           "lat": 18.36, "lng": 73.85, "amount": 145})
        elif c["scenario_id"] == "fastag_mismatch":
            events.append({"ts": c["incident"]["datetime"][:11] + "01:30:00+05:30", "type": "parking", "plaza": "Andheri mall parking",
                           "city": "Mumbai", "lat": 19.12, "lng": 72.85, "amount": 120})
        iib.setdefault(reg, []).extend([{"insurer": "Other insurer", "type": "OD", "date": c["created_at"][:10]}] * (2 if c["checks"]["iib"]["level"] == "warn" else 0))
        lic = c["checks"]["dl"]["data"]
        dls[lic["dl_number"]] = {"holder": lic["holder"], "classes": lic["classes"], "valid_from": lic["valid_from"], "valid_to": lic["valid_to"],
                                 "status": "expired" if c["checks"]["dl"]["level"] == "fail" else "valid"}
    return {"vahan.json": vahan, "fastag.json": fastag, "iib.json": iib, "driving_licences.json": dls, "police_records.json": police}


def notifications_for(claims: list[dict]) -> list[dict]:
    recent = sorted(claims, key=lambda c: c["updated_at"], reverse=True)
    out, n = [], 0
    for uid in ("u_001", "u_002"):
        for i, c in enumerate(recent[:20]):
            title = {"SIU_INVESTIGATION": "Referred to SIU", "UNDER_REVIEW": "Awaiting your review", "INFO_REQUESTED": "Information requested",
                     "PREAUTH_ISSUED": "Pre-auth issued automatically", "SETTLED": "Claim settled", "APPROVED": "Claim approved",
                     "PROCESSING": "New claim in AI processing", "DECLINED": "Claim declined", "FRAUD_CONFIRMED": "Fraud confirmed",
                     "WITHDRAWN": "Claim withdrawn"}[c["status"]]
            out.append({"id": f"n_{n:03d}", "user_id": uid, "title": f"{title}: {c['id']}", "body": f"{c['customer_name']} · {c['vehicle']['model']}",
                        "href": f"/claims/{c['id']}", "created_at": c["updated_at"], "read": i > 5})
            n += 1
    for c in [c for c in claims if c["customer_id"] == "c_0001"]:
        out.append({"id": f"n_{n:03d}", "user_id": "u_003", "title": f"Update on your claim {c['id']}", "body": c["communications"][-1]["text"],
                    "href": f"/claims/{c['id']}", "created_at": c["updated_at"], "read": False})
        n += 1
    return out


def seed() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    n_users = seed_users()
    seed_reference()
    data = generate()
    for claim in data["claims"]:
        Claim.model_validate(claim)

    write_json_sync("garages.json", data["garages"])
    write_json_sync("customers.json", data["customers"])
    write_json_sync("vehicles.json", data["vehicles"])
    write_json_sync("policies.json", data["policies"])
    n_docs = DOCS.render_all(data["claims"])  # sets each document's url/thumb; swapped in file by file when complete
    write_json_sync("claims.json", data["claims"])
    for name, value in mocks_for(data).items():
        write_json_sync(name, value)
    write_json_sync("notifications.json", notifications_for(data["claims"]))
    scenario_ids = {c["scenario_id"]: c["id"] for c in data["claims"] if c["scenario_id"]}
    whatsapp = read_json_sync("whatsapp_scenarios.json", []) or []
    for s in whatsapp:
        s["claim_id"] = scenario_ids.get(s["id"], s.get("claim_id"))
    write_json_sync("whatsapp_scenarios.json", whatsapp)

    claims = data["claims"]
    print(f"Seed anchor: {iso(NOW)}")
    print(f"users={n_users} customers={len(data['customers'])} vehicles={len(data['vehicles'])} garages={len(data['garages'])} claims={len(claims)}")
    print("by status:", dict(Counter(c["status"] for c in claims).most_common()))
    print("by type:  ", dict(Counter(c["claim_type"] for c in claims).most_common()))
    print("by band:  ", dict(Counter(c["risk_band"] for c in claims).most_common()))
    print("by month: ", " ".join(f"{k}:{v}" for k, v in sorted(Counter(c["created_at"][:7] for c in claims).items())))
    print("auto-decided:", sum(1 for c in claims if c["decision"]["auto"]), " distinct claimed amounts:", len({c["amount_claimed"] for c in claims}))
    for c in claims:
        if c["scenario_id"]:
            print(f"  {c['scenario_id']:<18} {c['id']}  {c['status']:<18} score={c['risk_score']:<3} net=₹{inr(c['financials']['net_payable'])}"
                  f"{'  TOTAL LOSS' if c['financials']['total_loss_check']['is_total_loss'] else ''}")
    print(f"documents rendered: {n_docs} · photo reuse fallbacks for unique sets: {PICKER.shortfall}")
    print("All claims validated against schemas.claim.Claim")


if __name__ == "__main__":
    seed()
