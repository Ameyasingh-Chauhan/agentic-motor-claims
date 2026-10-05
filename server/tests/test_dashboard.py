"""Dashboard (§10.5): every number is computed from the data at request time, matches the Home KPIs for the same range, and every
drill-down link opens a claims list whose total equals the number on the chart. Runs on the temporary data copy (conftest.py)."""
from __future__ import annotations

import asyncio
import copy

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth
from app.services.claim_views import now_ist
from app.services.json_store import read_json_sync, update_json


def login(name="Santosh Kute", password="Admin@123") -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
    return c


@pytest.fixture(autouse=True)
def clear_lockout():
    auth._failures.clear()
    yield


def listed_total(client: TestClient, base: dict, link: dict) -> int:
    return client.get("/api/claims", params={**base, **link, "page_size": 1}).json()["total"]


def test_fy_totals_match_home_kpis():
    client = login()
    dash = client.get("/api/stats/dashboard").json()
    assert dash["period"]["preset"] == "fy"
    home = {k["key"]: k["value"] for k in client.get("/api/stats/home").json()["kpis"]}
    t = dash["totals"]
    assert t["claims"] == home["total_claims"]
    assert t["paid"] == home["settled_approved"]
    assert t["approved"] == pytest.approx(home["amount_approved"])
    assert t["fraud_detected"] == home["fraud_detected"]
    assert t["fraud_savings"] == pytest.approx(home["fraud_savings"])
    assert t["avg_tat_h"] == pytest.approx(home["avg_turnaround"])
    assert t["stp_rate"] == pytest.approx(home["stp_rate"], abs=0.05)
    kpis = {k["key"]: k for k in dash["kpis"]}
    assert len(kpis) == 6 and kpis["claims"]["value"] == home["total_claims"]
    assert all(len(k["series"]) == len(dash["charts"]["filed_settled"]["buckets"]) for k in kpis.values())


def test_every_drill_down_matches_its_number():
    client = login()
    dash = client.get("/api/stats/dashboard", params={"range": "last_24m"}).json()
    base, ch = dash["base_link"], dash["charts"]
    assert listed_total(client, base, {}) == dash["total"]
    for k in dash["kpis"]:
        if k["key"] in ("claims",):
            assert listed_total(client, base, k["link"]) == k["value"]
    checks = []
    for key in ("status", "vehicle_type", "claim_type", "fraud_flags", "cities"):
        checks += [(key, i["link"], i["value"]) for i in ch[key]["items"]]
    checks += [("risk", b["link"], b["value"]) for b in ch["risk_distribution"]["bins"]]
    checks += [("funnel", s["link"], s["value"]) for s in ch["funnel"]["stages"]]
    checks += [("sankey", lk["link"], lk["value"]) for lk in ch["routing"]["links"]]
    checks += [("garage", g["link"], g["volume"]) for g in ch["garages"]["items"]]
    fs = ch["filed_settled"]
    checks += [("filed", lk, v) for lk, v in zip(fs["links"]["filed"], fs["filed"])]
    checks += [("settled", lk, v) for lk, v in zip(fs["links"]["settled"], fs["settled"])]
    checks += [("override", lk, v) for lk, v in zip(ch["overrides"]["links"], ch["overrides"]["overrides"])]
    for s in ch["channel_trend"]["series"]:
        checks += [("channel", lk, v) for lk, v in zip(s["links"], s["values"])]
    for row in ch["claim_size"]["rows"]:
        checks += [("size", cell["link"], cell["count"]) for cell in row["cells"]]
    for s in ch["tat"]["series"]:
        checks += [("tat", cell["link"], cell["count"]) for cell in s["values"]]
    for hour, dow, n in [c for c in ch["heatmap"]["cells"] if c[2]][:6]:   # cells are [hour, day, count]
        checks.append(("heat", {"dow": str(dow), "hour": str(hour)}, n))
    for p in ch["yoy"]["periods"]:  # YoY ignores the date range by definition: drop it from the base link
        for m in p["metrics"].values():
            if "segment" not in m["link"] or m["link"]["segment"] == "fraud_detected":
                checks.append(("yoy", {**{k: v for k, v in base.items() if k not in ("from", "to")}, **m["link"]}, m["value"]))
    assert len(checks) > 80
    for name, link, value in checks:
        assert listed_total(client, base, link) == value, (name, link)
    stp = ch["stp"]
    assert listed_total(client, base, stp["link"]) == stp["auto"]


def test_filters_change_every_chart_consistently():
    client = login()
    full = client.get("/api/stats/dashboard", params={"range": "last_24m"}).json()
    two_w = client.get("/api/stats/dashboard", params={"range": "last_24m", "vehicle_type": "2W", "channel": "whatsapp,app"}).json()
    assert 0 < two_w["total"] < full["total"]
    ch = two_w["charts"]
    assert sum(i["value"] for i in ch["status"]["items"]) == two_w["total"]
    assert {i["key"]: i["value"] for i in ch["vehicle_type"]["items"]} == {"2W": two_w["total"], "Car": 0, "CV": 0}
    assert sum(ch["filed_settled"]["filed"]) == two_w["total"] == ch["funnel"]["stages"][0]["value"]
    assert sum(sum(s["values"]) for s in ch["channel_trend"]["series"]) == two_w["total"]
    assert {s["key"] for s in ch["channel_trend"]["series"] if sum(s["values"])} <= {"whatsapp", "app"}
    assert sum(c[2] for c in ch["heatmap"]["cells"]) == two_w["total"]
    assert two_w["base_link"]["vehicle_type"] == "2W" and two_w["base_link"]["channel"] == "whatsapp,app"
    assert two_w["kpis"][0]["value"] == two_w["total"]


def test_presets_and_buckets():
    client = login()
    month = client.get("/api/stats/dashboard", params={"range": "this_month"}).json()["period"]
    assert month["bucket"] == "day" and month["from"].endswith("-01")
    q = client.get("/api/stats/dashboard", params={"range": "last_3m"}).json()["period"]
    assert q["bucket"] == "week"
    last = client.get("/api/stats/dashboard", params={"range": "last_fy"}).json()["period"]
    assert last["from"].endswith("-04-01") and last["to"].endswith("-03-31") and last["bucket"] == "month"
    custom = client.get("/api/stats/dashboard", params={"from": "2025-01-01", "to": "2025-01-20"}).json()["period"]
    assert custom["preset"] == "custom" and custom["days"] == 20 and custom["prior_to"] == "2024-12-31"
    assert client.get("/api/stats/dashboard", params={"from": "not-a-date"}).status_code == 422


def test_new_claim_appears_immediately():
    client = login()
    before = client.get("/api/stats/dashboard").json()
    now = now_ist().isoformat(timespec="seconds")

    def add(claims):
        src = next(c for c in claims if c["status"] == "SETTLED")
        new = copy.deepcopy(src) | {"id": "ABC-MC-2026-999999", "created_at": now, "updated_at": now, "origin": "app"}
        claims.append(new)

    asyncio.run(update_json("claims.json", add, []))
    after = client.get("/api/stats/dashboard").json()
    assert after["total"] == before["total"] + 1
    assert after["totals"]["paid"] == before["totals"]["paid"] + 1


def test_agent_performance_reads_pipeline_runs():
    client = login()
    claim = next(c for c in read_json_sync("claims.json") if c["status"] == "SETTLED" and c["created_at"] >= "2026-04-01")
    agents = {k: {"level": "pass", "summary": "", "duration_ms": 60_000, "source": "fallback" if k == "damage" else "live"}
              for k in ("intake", "document", "verification", "damage", "fraud", "adjudication", "communication")}

    def add(runs):
        runs.append({"id": claim["pipeline_run_id"], "claim_id": claim["id"], "status": "completed", "agents": agents, "events": []})

    before = client.get("/api/stats/dashboard").json()["charts"]["agents"]
    asyncio.run(update_json("pipeline_runs.json", add, []))
    after = client.get("/api/stats/dashboard").json()["charts"]["agents"]
    assert after["live_runs"] == before["live_runs"] + 1 and after["historical_runs"] == before["historical_runs"] - 1
    damage = next(a for a in after["agents"] if a["key"] == "damage")
    assert damage["success_rate"] < 100 and damage["runs"] == next(a for a in before["agents"] if a["key"] == "damage")["runs"]
    assert after["insight"]


def test_dashboard_is_admin_only_and_customers_cannot_probe_internal_filters():
    rahul = login("Rahul Sharma", "Pass@123")
    assert rahul.get("/api/stats/dashboard").status_code == 403
    mine = rahul.get("/api/claims", params={"page_size": 1}).json()["total"]
    for probe in ({"segment": "overridden"}, {"segment": "fraud_detected"}, {"outcome": "fraud_confirmed"}, {"rule": "FR-12"},
                  {"route": "SIU"}, {"min_risk": "90"}):
        assert rahul.get("/api/claims", params={**probe, "page_size": 1}).json()["total"] == mine, probe
