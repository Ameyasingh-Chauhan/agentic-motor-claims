"""Read-only access to the §12/§13 reference JSON (rate cards, catalogue, fraud rules).

Loaded once through json_store and cached in-process; `reload()` drops the cache (seed / Dev Tools reset).
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from .json_store import read_json_sync


@dataclass(frozen=True)
class Reference:
    parts: dict          # part_code → catalogue entry
    models: dict         # model key (e.g. HYU-CRE) → model entry
    labour_rates: dict
    labour_operations: dict
    paint_rates: dict
    depreciation: dict
    deductibles: dict
    fraud_rules: list


@lru_cache(maxsize=1)
def load() -> Reference:
    parts = read_json_sync("parts_catalog.json", []) or []
    models = read_json_sync("vehicle_models.json", []) or []
    return Reference(
        parts={p["part_code"]: p for p in parts},
        models={m["key"]: m for m in models},
        labour_rates=read_json_sync("labour_rates.json", {}) or {},
        labour_operations=read_json_sync("labour_operations.json", {}) or {},
        paint_rates=read_json_sync("paint_rates.json", {}) or {},
        depreciation=read_json_sync("depreciation_rules.json", {}) or {},
        deductibles=read_json_sync("deductibles.json", {}) or {},
        fraud_rules=read_json_sync("fraud_rules.json", []) or [],
    )


def reload() -> Reference:
    load.cache_clear()
    return load()
