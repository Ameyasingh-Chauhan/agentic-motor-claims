"""Auth, demo accounts, claims list and home stats over HTTP."""
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.routers import auth

USERS = [("Santosh Kute", "Admin@123"), ("Ameya Chauhan", "0376"), ("Rahul Sharma", "Pass@123")]


def login(name="Santosh Kute", password="Admin@123") -> TestClient:
    client = TestClient(app)
    assert client.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
    return client


@pytest.fixture(autouse=True)
def clear_lockout():
    auth._failures.clear()
    yield
    auth._failures.clear()


def test_login_all_users_and_wrong_password():
    for name, password in USERS:
        client = TestClient(app)
        assert client.post("/api/auth/login", json={"username": f"  {name.lower()} ", "password": password}).status_code == 200
        assert client.get("/api/auth/me").json()["user"]["username"] == name
        bad = client.post("/api/auth/login", json={"username": name, "password": "wrong"})
        assert bad.status_code == 401 and bad.json()["detail"]["code"] == "invalid_credentials"


def test_lockout_after_five_failures():
    client = TestClient(app)
    for _ in range(5):
        client.post("/api/auth/login", json={"username": "Santosh Kute", "password": "nope"})
    locked = client.post("/api/auth/login", json={"username": "Santosh Kute", "password": "Admin@123"})
    assert locked.status_code == 429 and locked.json()["detail"]["retry_after"] > 0


def test_demo_accounts_fill_real_credentials():
    accounts = TestClient(app).get("/api/auth/demo-accounts").json()["accounts"]
    assert [(a["username"], a["password"]) for a in accounts] == USERS
    for a in accounts:  # the tile's credentials sign in through the normal endpoint
        login(a["username"], a["password"])


def test_demo_accounts_hidden_when_demo_mode_off(monkeypatch):
    monkeypatch.setattr(auth, "get_settings", lambda: Settings(demo_mode=False))
    assert TestClient(app).get("/api/auth/demo-accounts").status_code == 404


def test_demo_login_endpoint_is_gone():
    assert TestClient(app).post("/api/auth/demo-login", json={"username": "Santosh Kute"}).status_code in (404, 405)


def test_kpi_click_through_matches_value():
    client = login()
    stats = client.get("/api/stats/home").json()
    assert stats["period"]["delta_label"] == "vs prior 30 days"
    kpis = {k["key"]: k for k in stats["kpis"]}
    assert len(kpis) == 8
    for key in ("total_claims", "settled_approved", "fraud_detected", "pending_action"):
        listed = client.get("/api/claims", params={**kpis[key]["link"], "page_size": 1}).json()["total"]
        assert listed == kpis[key]["value"], key
    links = {tuple(sorted(k["link"].items())) for k in kpis.values()}
    assert len(links) >= 7  # every card opens its own filter
    assert any(k["delta"] and k["delta"]["value"] != 0 for k in kpis.values())
    assert all(len(k["series"]) == 12 for k in kpis.values())
    assert kpis["stp_rate"]["value"] > 0


def test_home_insights_admin():
    stats = login().get("/api/stats/home").json()
    assert 0 < len(stats["needs_attention"]) <= 6
    assert sum(b["count"] for b in stats["status_buckets"]) == stats["total_claims"]
    assert len(stats["recent_activity"]) == 6
    assert stats["hero"]["agents_online"] == 7


def test_claim_filters_and_counts():
    client = login()
    data = client.get("/api/claims", params={"status": "SETTLED,APPROVED", "page_size": 100}).json()
    assert {c["status"] for c in data["items"]} <= {"SETTLED", "APPROVED"}
    assert data["all_count"] == sum(data["status_counts"].values())
    pune = client.get("/api/claims", params={"city": "Pune", "vehicle_type": "Car", "page_size": 100}).json()["items"]
    assert pune and all(c["city"] == "Pune" and c["vehicle"]["type"] == "Car" for c in pune)
    by_reg = client.get("/api/claims", params={"q": "mh12ab1234"}).json()["items"]
    assert any(c["registration"] == "MH 12 AB 1234" for c in by_reg)
    risky = client.get("/api/claims", params={"sort": "risk:desc"}).json()["items"]
    assert risky[0]["risk_score"] >= risky[-1]["risk_score"]


FORBIDDEN = ("fraud", "risk_score", "risk_band", "audit", "internal_notes", "flags")


def test_customer_sees_only_safe_own_claims():
    client = login("Rahul Sharma", "Pass@123")
    data = client.get("/api/claims", params={"sort": "risk:desc"}).json()
    assert data["total"] == 3
    assert all(key not in c for c in data["items"] for key in FORBIDDEN)
    detail = client.get(f"/api/claims/{data['items'][0]['id']}").json()
    assert all(key not in detail for key in FORBIDDEN)
    assert "reasons" not in detail["decision"]
    stats = client.get("/api/stats/home").json()
    text = str(stats).lower()
    assert all(word not in text for word in ("fraud", "siu", "risk", "rule"))
    assert [k["key"] for k in stats["kpis"]] == ["my_claims", "approved_amount", "in_progress", "last_update"]
    other = client.get("/api/claims", params={"q": "MH 12 XX 4521"}).json()
    assert other["total"] == 0
