"""Data Manager: admin/developer-only removal of claims and policies, independently of one another."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.json_store import read_json_sync
from test_api import login

CLAIM = "ABC-MC-2026-000252"
POLICY = "ABC/PC/2025/604821"


def test_customer_forbidden_and_anonymous_rejected():
    assert TestClient(app).get("/api/admin/data/claims").status_code == 401
    cust = login("Rahul Sharma", "Pass@123")
    assert cust.get("/api/admin/data/claims").status_code == 403
    assert cust.post("/api/admin/data/claims/delete", json={"ids": [CLAIM]}).status_code == 403
    assert any(c["id"] == CLAIM for c in read_json_sync("claims.json", []))


def test_remove_claim_keeps_policy():
    admin = login()
    assert any(r["id"] == CLAIM for r in admin.get("/api/admin/data/claims").json()["items"])
    res = admin.post("/api/admin/data/claims/delete", json={"ids": [CLAIM, "ABC-NOPE"]}).json()
    assert res == {"removed": [CLAIM], "not_found": ["ABC-NOPE"]}
    assert not any(c["id"] == CLAIM for c in read_json_sync("claims.json", []))
    assert not any(r.get("claim_id") == CLAIM for r in read_json_sync("pipeline_runs.json", []))
    assert not any(n.get("href", "").endswith(CLAIM) for n in read_json_sync("notifications.json", []))
    from app import config
    assert not (config.UPLOADS_DIR / CLAIM).exists()
    assert any(p["policy_no"] == POLICY for p in read_json_sync("policies.json", []))


def test_remove_policy_keeps_claim_and_cleans_orphans():
    admin = login("Ameya Chauhan", "0376")
    before = {f: len(read_json_sync(f"{f}.json", [])) for f in ("policies", "customers", "vehicles")}
    # the claim still references the customer/vehicle, so only the policy goes
    res = admin.post("/api/admin/data/policies/delete", json={"policy_nos": [POLICY.lower()]}).json()
    assert res["removed"] == [POLICY] and res["also_removed"] == {"customers": 0, "vehicles": 0}
    assert len(read_json_sync("policies.json", [])) == before["policies"] - 1
    assert any(c["id"] == CLAIM for c in read_json_sync("claims.json", []))
    # remove the claim, then another policy-less pass: a fresh policy removal now cleans the orphans
    admin.post("/api/admin/data/claims/delete", json={"ids": [CLAIM]})
    policies = read_json_sync("policies.json", [])
    victim = policies[-1]  # not referenced by a claim? make sure
    claims = read_json_sync("claims.json", [])
    shared = any(c["customer_id"] == victim["customer_id"] or c["vehicle_id"] == victim["vehicle_id"] for c in claims)
    out = admin.post("/api/admin/data/policies/delete", json={"policy_nos": [victim["policy_no"]]}).json()
    assert out["removed"] == [victim["policy_no"]]
    if not shared:
        assert out["also_removed"]["vehicles"] == 1
        assert not any(v["id"] == victim["vehicle_id"] for v in read_json_sync("vehicles.json", []))


def test_uploaded_policy_orphans_removed_after_its_claim():
    admin = login()
    claim = next(c for c in read_json_sync("claims.json", []) if c["id"] == CLAIM)
    admin.post("/api/admin/data/claims/delete", json={"ids": [CLAIM]})
    res = admin.post("/api/admin/data/policies/delete", json={"policy_nos": [POLICY]}).json()
    assert res["also_removed"] == {"customers": 1, "vehicles": 1}
    assert not any(v["id"] == claim["vehicle_id"] for v in read_json_sync("vehicles.json", []))
    assert not any(c["id"] == claim["customer_id"] for c in read_json_sync("customers.json", []))
    assert claim["registration"] not in read_json_sync("vahan.json", {})
