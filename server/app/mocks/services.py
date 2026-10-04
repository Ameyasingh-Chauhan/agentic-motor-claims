"""Deterministic async stand-ins for external DPI systems (spec §14.1–14.2).

Each mock looks up the seeded JSON, waits a realistic latency and returns the record. Unknown registrations get a deterministic
"clean" profile. In live pipeline runs 2 % of calls fail transiently (`MockTransientError`) so the Theatre can show a retry; the
verification agent retries them. Scenario claims and tests disable that (`flaky=False`, AMC_MOCK_LATENCY_SCALE=0).
"""
from __future__ import annotations

import asyncio
import os
import random

from ..services.json_store import read_json

LATENCY_MS = {"policy": (80, 200), "vahan": (250, 600), "fastag": (300, 700), "iib": (250, 500), "dl": (200, 450),
              "police": (200, 400), "kyc": (60, 120)}
FAILURE_RATE = 0.02


class MockTransientError(RuntimeError):
    pass


def _scale() -> float:
    try:
        return float(os.environ.get("AMC_MOCK_LATENCY_SCALE", "1"))
    except ValueError:
        return 1.0


async def _wait(name: str, flaky: bool) -> int:
    lo, hi = LATENCY_MS[name]
    ms = random.randint(lo, hi)
    await asyncio.sleep(ms / 1000 * _scale())
    if flaky and random.random() < FAILURE_RATE:
        raise MockTransientError(f"{name} service timed out")
    return ms


async def _lookup(file: str, key: str, default):
    data = await read_json(file, {})
    return data.get(key, default) if isinstance(data, dict) else default


async def vahan(registration: str, *, flaky: bool = False) -> tuple[dict, int]:
    ms = await _wait("vahan", flaky)
    clean = {"registration": registration, "owner": None, "class": None, "make_model": None, "rc_status": "active",
             "hypothecation": None, "blacklisted": False, "stolen": False, "registered_on": None, "profile": "generated_clean"}
    return await _lookup("vahan.json", registration, clean), ms


async def fastag(registration: str, *, flaky: bool = False) -> tuple[list, int]:
    ms = await _wait("fastag", flaky)
    return await _lookup("fastag.json", registration, []), ms


async def iib(registration: str, *, flaky: bool = False) -> tuple[list, int]:
    ms = await _wait("iib", flaky)
    return await _lookup("iib.json", registration, []), ms


async def police(registration: str, *, flaky: bool = False) -> tuple[list, int]:
    ms = await _wait("police", flaky)
    return await _lookup("police_records.json", registration, []), ms


async def policy(policy_no: str, *, flaky: bool = False) -> tuple[dict | None, int]:
    ms = await _wait("policy", flaky)
    policies = await read_json("policies.json", [])
    return next((p for p in policies if p["policy_no"] == policy_no), None), ms


async def kyc(customer_id: str, *, flaky: bool = False) -> tuple[dict | None, int]:
    ms = await _wait("kyc", flaky)
    customers = await read_json("customers.json", [])
    return next(({"name": c["name"], **(c.get("kyc") or {})} for c in customers if c["id"] == customer_id), None), ms
