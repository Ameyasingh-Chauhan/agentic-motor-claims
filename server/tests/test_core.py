from app.services.costing import depreciation_pct, compulsory_deductible, worked_example, calculate_cost
from app.services.dmn_engine import evaluate_fraud
from fastapi.testclient import TestClient
from app.main import app

def test_worked_example():
    assert worked_example()["display_net_payable"] == 24130

def test_depreciation_slabs():
    assert depreciation_pct("metal", 6) == 0
    assert depreciation_pct("metal", 7) == .05
    assert depreciation_pct("metal", 25) == .15
    assert depreciation_pct("plastic", 1) == .5

def test_deductibles():
    assert compulsory_deductible("Car", 1497) == 1000
    assert compulsory_deductible("Car", 1600) == 2000
    assert compulsory_deductible("2W") == 100
    assert compulsory_deductible("CV") == 500

def test_total_loss_check():
    result=calculate_cost([{"part_code":"x","replace_price":100000,"material":"metal","hours":1}],idv=100000,cc=1497)
    assert result["total_loss"] is True

def test_every_fraud_rule():
    contexts=[{"location_contradiction":True},{"pre_existing_confidence":.8},{"narrative_consistent":False,"narrative_confidence":.8},{"od_claims_12m":2},{"early_claim":True},{"garage_variance":20},{"network_link":True},{"blacklisted_or_stolen":True},{"owner_mismatch":True},{"invalid_dl":True},{"photo_metadata_mismatch":True},{"late_intimation":True},{"commercial_use":True},{"unwitnessed_night":True},{"tampering":True}]
    for context in contexts:
        assert evaluate_fraud(context)["fired_rule_ids"]

def test_demo_login_all_users():
    for name in ("Santosh Kute", "Ameya Chauhan", "Rahul Sharma"):
        response = TestClient(app).post("/api/auth/demo-login", json={"username": f"  {name.lower()}  "})
        assert response.status_code == 200

def test_normal_login_all_users_and_wrong_passwords():
    users = [("Santosh Kute", "Admin@123"), ("Ameya Chauhan", "0376"), ("Rahul Sharma", "Pass@123")]
    for name, password in users:
        client = TestClient(app)
        assert client.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
        assert client.post("/api/auth/login", json={"username": name, "password": "wrong"}).status_code == 401

def test_home_stats_and_claim_filters_customer_safe():
    client=TestClient(app)
    assert client.post("/api/auth/login",json={"username":"Santosh Kute","password":"Admin@123"}).status_code==200
    stats=client.get("/api/stats/home"); assert stats.status_code==200 and len(stats.json()["kpis"])==8
    filtered=client.get("/api/claims",params={"status":"SETTLED","page_size":5}); assert filtered.status_code==200 and all(c["status"]=="SETTLED" for c in filtered.json()["items"])
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login",json={"username":"Rahul Sharma","password":"Pass@123"}).status_code==200
    data=client.get("/api/claims").json(); assert all(c["customer_id"]=="c_0001" for c in data["items"])
    assert all(key not in c for c in data["items"] for key in ("fraud","risk","audit","internal_notes"))
