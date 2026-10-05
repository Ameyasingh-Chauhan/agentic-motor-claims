"""WhatsApp Journey (§10.9): five replays built from real claims, every message type, customer-safe for the customer role.
Runs on the temporary data copy (conftest.py)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth
from app.services.json_store import read_json_sync
from tests.test_actions import BANNED, tokens

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import make_whatsapp_scenarios  # noqa: E402

TYPES = {"text", "voice", "images", "document", "location", "quick_replies", "list", "template", "status", "payment", "rating"}


def login(name="Santosh Kute", password="Admin@123") -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
    return c


@pytest.fixture(autouse=True)
def clear_lockout():
    auth._failures.clear()
    yield


def test_admin_gets_five_journeys_matching_their_claims():
    items = login().get("/api/whatsapp/scenarios").json()["items"]
    assert [s["id"] for s in items] == ["happy_path", "more_info", "theft", "flagged", "settlement"]
    claims = {c["id"]: c for c in read_json_sync("claims.json")}
    seen = set()
    for s in items:
        c = claims[s["claim_id"]]
        assert (s["customer_name"], s["registration"], s["customer_id"]) == (c["customer_name"], c["registration"], c["customer_id"])
        assert [ch["index"] for ch in s["chapters"]] == sorted(ch["index"] for ch in s["chapters"])
        assert [m["ts"] for m in s["messages"]] == sorted(m["ts"] for m in s["messages"])
        seen |= {m["type"] for m in s["messages"]}
        for m in s["messages"]:
            if m["from"] == "business":   # what the customer reads is always customer-safe, also in the admin replay
                assert not tokens({k: v for k, v in m.items() if k != "under_the_hood"}) & BANNED, m["id"]
    assert seen == TYPES
    pay = next(m for m in items[-1]["messages"] if m["type"] == "payment")
    assert pay["amount"] == claims[items[-1]["claim_id"]]["amount_approved"]
    flagged = next(s for s in items if s["id"] == "flagged")
    assert any((m["under_the_hood"] or {}).get("agent") == "fraud" for m in flagged["messages"])


def test_customer_gets_only_own_journeys_without_internal_detail():
    resp = login("Rahul Sharma", "Pass@123").get("/api/whatsapp/scenarios").json()
    assert {s["id"] for s in resp["items"]} == {"happy_path", "more_info"}
    assert all(s["customer_id"] == "c_0001" for s in resp["items"])
    assert not tokens(resp) & BANNED


def test_builder_is_deterministic_from_claims():
    claims = read_json_sync("claims.json")
    assert make_whatsapp_scenarios.build(claims) == make_whatsapp_scenarios.build(claims)
    assert make_whatsapp_scenarios.inr(125000) == "₹1,25,000" and make_whatsapp_scenarios.inr(3460.4) == "₹3,460"
