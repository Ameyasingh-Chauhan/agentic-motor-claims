"""Stock-photo selection for seeded claims (spec §11.3, §18).

Photos come from `stock_photo_manifest.json` (curated in `stock_curation.py`, processed by `fetch_stock_images.py build`).
A claim's photos always come from one vehicle `group` (several shots of the same car) plus, optionally, a close-up of
the same colour, so a claim never shows two different cars. Damage items are derived from the parts boxed on those
photos, which is what keeps every annotation box on visible damage. Photos are reused freely across seeded claims (reuse is
spread evenly); only the five demo scenarios name distinct, curated sets (seed.SCENARIO_PHOTOS).
"""
from __future__ import annotations

import random
from collections import Counter, defaultdict

BODY_BY_MODEL = {
    "MAR-SWI": "hatch", "MAR-BAL": "hatch", "MAR-WAG": "hatch", "MAR-ALT": "hatch", "HYU-I20": "hatch", "TAT-ALT": "hatch",
    "REN-KWD": "hatch", "MAR-DZI": "sedan", "HON-CIT": "sedan", "HYU-CRE": "suv", "TAT-NEX": "suv", "HYU-VEN": "suv",
    "MAR-BRZ": "suv", "KIA-SEL": "suv", "MAH-XUV": "suv", "MAH-SCN": "suv", "TOY-INH": "suv", "KIA-CAR": "suv", "TAT-PUN": "suv",
    "HON-ACT": "scooter", "TVS-JUP": "scooter", "HER-SPL": "motorcycle", "HON-SHI": "motorcycle", "BAJ-PNS": "motorcycle",
    "ROY-CLA": "motorcycle", "TVS-APA": "motorcycle",
}
COLOUR_FAMILY = {"Pearl White": "light", "Silver": "light", "Grey": "mid", "Black": "dark", "Blue": "dark", "Red": "warm",
                 "Orange": "warm", "Brown": "warm", "Yellow": "warm", "Green": "dark", "Champagne": "light"}

# Damage word on the photo → costing operation (spec §12.9 operations).
REPLACE_WORDS = {"broken", "torn", "shattered", "deformed", "crushed", "bent", "missing", "oxidised fracture", "water damage", "submerged"}


def operation_for(part: dict, damage_type: str, severity: str) -> str:
    if damage_type in REPLACE_WORDS or part["material"] in ("glass", "rubber", "battery", "airbag") or not part.get("painted") and part["material"] == "plastic":
        return "replace"
    if damage_type == "scratch":
        return "paint_only" if part.get("painted") else "replace"
    if damage_type == "dent" and part["material"] == "metal":
        return "replace" if severity == "severe" else ("repair_moderate_dent" if severity == "moderate" else "repair_minor_dent")
    if damage_type == "crack" and part["material"] == "plastic":
        return "replace" if severity == "severe" else "plastic_repair"
    return "replace"


class MediaPicker:
    def __init__(self, photos: list[dict], seed: int = 2026):
        self.rng = random.Random(seed + 101)
        usable = [p for p in photos if p.get("url")]
        self.by_id = {p["id"]: p for p in usable}
        self.damage = [p for p in usable if p["category"] != "clean"]
        self.clean = [p for p in usable if p["category"] == "clean"]
        self.groups: dict[str, list[dict]] = defaultdict(list)
        for p in self.damage:
            self.groups[p["group"]].append(p)
        self.uses: Counter = Counter()          # spreads reuse evenly across claims

    # -- helpers ------------------------------------------------------------------------------
    def _take(self, photos: list[dict]) -> list[dict]:
        for p in photos:
            self.uses[p["id"]] += 1
        return photos

    def take_ids(self, ids: list[str]) -> list[dict]:
        """Scenarios name their photos explicitly (best match, curated)."""
        return self._take([self.by_id[i] for i in ids if i in self.by_id])

    # -- damage photos ------------------------------------------------------------------------
    def for_claim(self, vtype: str, incident: str, *, model_key: str | None = None,
                  parts: set[str] | None = None, max_photos: int = 3, colour: str | None = None,
                  allow_pre_existing: bool = False) -> list[dict]:
        """Pick one vehicle group (+ optional same-colour close-up) suited to the incident and vehicle type.

        Photos showing pre-existing damage are only used when the claim's story includes it (FR-02); `colour` keeps a
        vehicle's later claims consistent with the colour its first photo set gave it."""
        body = BODY_BY_MODEL.get(model_key or "", "any")
        family = COLOUR_FAMILY.get(colour or "", None)

        def clean_story(p: dict) -> bool:
            return allow_pre_existing or not any(b.get("kind") == "pre_existing" for b in p["boxes"])

        def body_ok(p: dict) -> bool:  # a scooter and a motorcycle look nothing alike, so two-wheeler bodies must match
            return vtype != "2W" or body == "any" or p.get("body") in (body, "any")

        pool = [p for p in self.damage if p["vehicle_type"] == vtype and clean_story(p) and body_ok(p)]
        primaries = [p for p in pool if p["view"] != "closeup"]
        # Wide shots suited to the incident first; glass claims (and gaps in the pool) fall back to close-ups.
        suited = [p for p in primaries if incident in p["incidents"]] or [p for p in pool if incident in p["incidents"]] or primaries

        def score(p: dict) -> tuple:
            group_parts = {b["part"] for g in self.groups[p["group"]] for b in g["boxes"]}
            return (len(group_parts & parts) if parts else 0,
                    p.get("body") in (body, "any"),
                    family is None or COLOUR_FAMILY.get(p.get("colour") or "") == family,
                    -self.uses[p["id"]],
                    self.rng.random())

        if not suited:
            return []
        primary = max(suited, key=score)
        chosen = [primary] + [g for g in self.groups[primary["group"]]
                              if g["id"] != primary["id"]
                              and (g["category"] != "windshield" or incident in ("glass", "front_collision", "animal"))]
        chosen = chosen[:max_photos]
        if len(chosen) < max_photos:
            family = COLOUR_FAMILY.get(primary.get("colour") or "", "?")
            closeups = [p for p in self.damage if p["view"] == "closeup" and p["vehicle_type"] == vtype and clean_story(p)
                        and incident in p["incidents"] and COLOUR_FAMILY.get(p.get("colour") or "", "?") == family
                        and p["zone"] == primary["zone"]]
            if closeups:
                chosen.append(max(closeups, key=lambda p: (-self.uses[p["id"]], self.rng.random())))
        return self._take(chosen)

    # -- clean vehicle photos ------------------------------------------------------------------
    def clean_for(self, vtype: str, model_key: str | None) -> dict | None:
        body = BODY_BY_MODEL.get(model_key or "")
        same_type = [p for p in self.clean if p["vehicle_type"] == vtype]
        pool = [p for p in self.clean if p.get("model_key") == model_key] or [p for p in same_type if p.get("body") == body] or same_type
        if not pool:
            return None
        p = min(pool, key=lambda p: (self.uses[p["id"]], p["id"]))
        self.uses[p["id"]] += 1
        return p


def items_from_photos(photos: list[dict], prefix: str, parts_catalog: dict, severity: str) -> list[dict]:
    """Damage items for the parts boxed on the photos (fresh damage first, then pre-existing), deduplicated."""
    items, seen = [], set()
    for p in photos:
        for b in p["boxes"]:
            code = f"{prefix}-{b['part']}"
            if code in seen or code not in parts_catalog:
                continue
            seen.add(code)
            sev = p.get("severity", severity)
            items.append({"part_code": code, "operation": operation_for(parts_catalog[code], b["damage_type"], sev)})
    return items


# Catalogue variants that look the same on a photo (an LED headlamp is boxed as a headlamp).
PART_ALIASES = {"HLED": "HLMP"}


def boxes_for(item_code: str, suffix: str, media: list[dict], photos: list[dict], part_name: str, damage_type: str | None = None,
              kind: str = "damage") -> list[dict]:
    """Annotation boxes for one damage item, taken from the photos the claim actually uses."""
    out = []
    for m, p in zip(media, photos):
        for b in p["boxes"]:
            if b["part"] == PART_ALIASES.get(suffix, suffix) and b.get("kind", "damage") == kind:
                out.append({"photo_id": m["id"], "box_2d": b["box_2d"], "label": f"{part_name} · {damage_type or b['damage_type']}"})
    return out


def media_entry(photo: dict, mid: str, slot: str) -> dict:
    """The parts of a claim media record that come from the stock photo (EXIF/quality are added by the seed)."""
    return {"id": mid, "kind": "photo", "slot": slot, "url": photo["url"], "thumb": photo["thumb"], "blur_data": photo["blur_data"],
            "width": photo.get("width"), "height": photo.get("height"), "stock_id": photo["id"], "credit": photo.get("credit")}
