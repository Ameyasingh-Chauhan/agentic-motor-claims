"""Map an extracted make/model to the parts-catalogue model_key; add a new segment-derived model (§12) when unmatched.

Reuses the §12 rate tables straight from `scripts/reference_data.py` (loaded by file path — that module is a seed-time
script, not part of the `app` package) instead of duplicating SEGMENTS/PARTS_BY_TYPE here.
"""
from __future__ import annotations

import importlib.util
import re
from pathlib import Path
from types import ModuleType

from ..config import SERVER_DIR
from .json_store import read_json, update_json
from . import reference

_ref_module: ModuleType | None = None

BASE_EX_SHOWROOM = {
    "CAR_ENTRY": 500_000, "CAR_PREMIUM_HATCH": 750_000, "CAR_COMPACT_SUV_SEDAN": 1_350_000,
    "CAR_MID_SUV_MPV": 2_000_000, "TW_COMMUTER": 85_000, "TW_PREMIUM": 180_000, "CV_LCV": 750_000,
}


def _reference_data() -> ModuleType:
    global _ref_module
    if _ref_module is None:
        path = SERVER_DIR / "scripts" / "reference_data.py"
        spec = importlib.util.spec_from_file_location("amc_reference_data", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        _ref_module = mod
    return _ref_module


def _norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").casefold())


async def find_model_key(make: str | None, model: str | None) -> str | None:
    """An existing catalogue model matching this make/model (ignoring case, spacing and a variant suffix)."""
    models = await read_json("vehicle_models.json", [])
    nm, nmo = _norm(make), _norm(model)
    if not nmo:
        return None
    exact = [m for m in models if _norm(m["make"]) == nm and _norm(m["model"]) == nmo]
    if exact:
        return exact[0]["key"]
    loose = [m for m in models if _norm(m["make"]) == nm and (nmo in _norm(m["model"]) or _norm(m["model"]) in nmo)]
    return loose[0]["key"] if loose else None


def _guess_segment(ref: ModuleType, vtype: str, cc: float | None) -> str:
    if vtype == "2W":
        return "TW_PREMIUM" if (cc or 0) > 150 else "TW_COMMUTER"
    if vtype == "CV":
        return "CV_LCV"
    cc = cc or 1200
    if cc < 1000:
        return "CAR_ENTRY"
    if cc < 1300:
        return "CAR_PREMIUM_HATCH"
    if cc < 1800:
        return "CAR_COMPACT_SUV_SEDAN"
    return "CAR_MID_SUV_MPV"


def _new_key(make: str, model: str, existing: set[str]) -> str:
    base = (re.sub(r"[^A-Z]", "", (make or "X").upper())[:3] or "XXX")
    tail = (re.sub(r"[^A-Z]", "", (model or "VEH").upper())[:3] or "VEH")
    key = f"{base}-{tail}"
    n = 1
    while key in existing:
        n += 1
        key = f"{base}-{tail}{n}"
    return key


async def ensure_model(*, make: str, model: str, variant: str | None = None, cc: float | None = None,
                       fuel: str | None = None, vtype: str = "Car") -> str:
    """The existing model_key for this make/model, or a brand-new segment-derived catalogue entry (pinned, §12)."""
    key = await find_model_key(make, model)
    if key:
        return key
    ref = _reference_data()
    models = await read_json("vehicle_models.json", [])
    key = _new_key(make, model, {m["key"] for m in models})
    segment = _guess_segment(ref, vtype, cc)
    seg = ref.SEGMENTS[segment]
    label = f"{model}{f' {variant}' if variant else ''}".strip()
    entry = {"key": key, "make": make, "model": label, "segment": segment, "type": seg["type"],
             "cc": cc or 0, "fuel": fuel or "Petrol", "ex_showroom": BASE_EX_SHOWROOM[segment]}

    def add_model(rows: list[dict]) -> None:
        rows.append(entry)

    await update_json("vehicle_models.json", add_model, [])

    parts = []
    for code, (name, material, replace, repair, painted, zone, rr_op, via) in ref.PARTS_BY_TYPE[seg["type"]].items():
        price = round(replace * seg["factor"], -1)
        parts.append({"part_code": f"{key}-{code}", "model_key": key, "model": label, "base_code": code, "part": name,
                      "material": material, "replace": int(price),
                      "repair": int(round(repair * seg["factor"], -1)) if repair else None, "painted": painted,
                      "zone": zone, "rr_operation": rr_op, "rr_accessed_via": [f"{key}-{v}" for v in via] if via else None,
                      "pinned": True})

    def add_parts(rows: list[dict]) -> None:
        rows.extend(parts)

    await update_json("parts_catalog.json", add_parts, [])
    reference.reload()
    return key
