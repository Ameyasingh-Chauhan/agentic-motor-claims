"""Stage 2 (§11.6): new claims filed in the app — create → upload → submit, private files, instant visibility in lists and stats.

Runs on the temporary data copy (conftest.py). Uploads use the bundled real sample set (client/public/assets/samples/in-app-claim/,
built by scripts/make_sample_upload_set.py): two damage photos with camera EXIF and a specimen RC.
"""
import json
from pathlib import Path

import bcrypt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth
from app.services.json_store import read_json_sync, write_json_sync

SAMPLES = Path(__file__).resolve().parents[2] / "client" / "public" / "assets" / "samples" / "in-app-claim"
SAMPLE = json.loads((SAMPLES / "sample.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def clear_lockout():
    auth._failures.clear()
    yield


def login(name: str, password: str) -> TestClient:
    client = TestClient(app)
    assert client.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
    return client


def rahul() -> TestClient:
    return login("Rahul Sharma", "Pass@123")


def admin() -> TestClient:
    return login("Santosh Kute", "Admin@123")


def other_customer() -> TestClient:
    """A second customer account, added to the temporary users.json only."""
    users = read_json_sync("users.json", [])
    customer = next(c for c in read_json_sync("customers.json", []) if c["id"] != "c_0001")
    users.append({"id": "u_900", "username": "Test Customer", "display_name": customer["name"], "role": "customer", "is_developer": False,
                  "customer_id": customer["id"], "password_hash": bcrypt.hashpw(b"Other@123", bcrypt.gensalt(4)).decode()})
    write_json_sync("users.json", users)
    return login("Test Customer", "Other@123")


def rahul_policy() -> dict:
    return next(p for p in read_json_sync("policies.json", []) if p["customer_id"] == "c_0001" and p["status"] == "active")


def draft_body(policy_no: str) -> dict:
    return {**SAMPLE["claim"], "policy_no": policy_no}


def upload(client: TestClient, claim_id: str, name: str, kind: str, slot: str):
    with open(SAMPLES / name, "rb") as fh:
        return client.post(f"/api/uploads/{claim_id}", files={"file": (name, fh, "image/jpeg")}, data={"kind": kind, "slot": slot})


def file_path(url: str) -> str:
    return url  # /api/files/<claim_id>/<file>


def test_rahul_files_a_claim_end_to_end(uploads_dir):
    r, a = rahul(), admin()
    before_admin = a.get("/api/stats/home").json()["total_claims"]
    before_rahul = r.get("/api/stats/home").json()["total_claims"]
    policy = rahul_policy()

    created = r.post("/api/claims", json=draft_body(policy["policy_no"]))
    assert created.status_code == 201, created.text
    claim = created.json()
    cid, reg = claim["id"], claim["registration"]
    assert claim["status"] == "DRAFT" and claim["customer_id"] == "c_0001"
    highest = max(int(c["id"][-6:]) for c in read_json_sync("claims.json", []) if c["id"] != cid)
    assert cid == f"ABC-MC-{cid[7:11]}-{highest + 1:06d}"  # the global 6-digit sequence continues

    # Drafts are not listed anywhere yet.
    assert a.get("/api/claims", params={"q": cid}).json()["total"] == 0

    for name, kind, slot in (("front.jpg", "photo", "front"), ("closeup.jpg", "photo", "closeup"), ("rc.jpg", "document", "rc")):
        res = upload(r, cid, name, kind, slot)
        assert res.status_code == 201, res.text

    submitted = r.post(f"/api/claims/{cid}/submit")
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["claim"]["status"] == "SUBMITTED" and submitted.json()["run_id"] is None

    # Listed for admin and owner, found by ID and by registration (with or without spaces).
    for client in (a, r):
        for q in (cid, reg, reg.replace(" ", "").lower()):
            items = client.get("/api/claims", params={"q": q}).json()["items"]
            assert cid in [i["id"] for i in items], (q, client is a)
    row = next(i for i in a.get("/api/claims", params={"q": cid}).json()["items"] if i["id"] == cid)
    assert row["origin"] == "app" and row["risk_score"] is None and row["photo"]["url"].startswith(f"/api/files/{cid}/")

    # The "AI processing" chip counts and filters submitted claims (they are waiting for the pipeline).
    listing = a.get("/api/claims", params={"q": cid, "status": "PROCESSING"}).json()
    assert listing["total"] == 1 and listing["status_counts"] == {"PROCESSING": 1} and listing["items"][0]["status"] == "SUBMITTED"

    # Stats include it immediately (no restart).
    assert a.get("/api/stats/home").json()["total_claims"] == before_admin + 1
    assert r.get("/api/stats/home").json()["total_claims"] == before_rahul + 1

    # Detail: processed media with thumbnails, EXIF and quality; the document is stored and received.
    detail = a.get(f"/api/claims/{cid}").json()
    photos = [m for m in detail["media"] if m["kind"] == "photo"]
    assert [m["slot"] for m in photos] == ["front", "closeup"]
    for m in photos:
        assert m["available"] and m["url"].endswith(".webp") and m["thumb"].endswith("-thumb.webp")
        assert m["blur_data"].startswith("data:image/webp;base64,") and max(m["width"], m["height"]) <= 1600
        assert m["exif"]["captured_at"].startswith("2026-10-03T18:4") and m["exif"]["device"] == "samsung Galaxy S23"
        assert m["exif"]["lat"] == pytest.approx(19.1197, abs=1e-3) and m["exif"]["lng"] == pytest.approx(72.8468, abs=1e-3)
        assert m["quality"]["ok"] and m["quality"]["blur_score"] > 0 and 0 < m["quality"]["brightness"] < 1
    (doc,) = detail["documents"]
    assert doc["type"] == "RC" and doc["requirement"] == "rc" and doc["status"] == "received" and doc["thumb"]
    assert doc["quality"]["ok"]  # a sharp, bright white document is fine (photo exposure rules do not apply)
    assert detail["timeline"][-1]["type"] == "fnol_received"
    assert [e["to"] for e in detail["audit"] if e["action"] == "status_change"] == ["SUBMITTED"]

    # Files live privately under uploads/<claim_id>/, never in client/public.
    stored = {f.name for f in (uploads_dir / cid).iterdir()}
    assert {"m_1.webp", "m_1-thumb.webp", "m_2.webp", "d_1.webp", "d_1-thumb.webp"} <= stored
    assert not (SAMPLES.parents[1] / cid).exists()

    # Access control: owner and admin yes; another customer and anonymous no.
    urls = [photos[0]["url"], photos[0]["thumb"], doc["url"], photos[0]["original_url"]]
    for url in urls:
        for client in (r, a):
            res = client.get(url)
            assert res.status_code == 200 and res.content and "private" in res.headers["cache-control"]
            assert res.headers["content-type"] == ("image/jpeg" if url.endswith(".jpg") else "image/webp")
        assert other_customer().get(url).status_code == 404
        assert TestClient(app).get(url).status_code == 401
    assert other_customer().get(f"/api/claims/{cid}").status_code == 404

    # Every admin is notified.
    notes = read_json_sync("notifications.json", [])
    assert {n["user_id"] for n in notes if n["href"] == f"/claims/{cid}"} == {"u_001", "u_002"}


def test_rahul_sees_a_customer_safe_view_of_his_new_claim():
    r = rahul()
    cid = r.post("/api/claims", json=draft_body(rahul_policy()["policy_no"])).json()["id"]
    upload(r, cid, "front.jpg", "photo", "front")
    claim = r.post(f"/api/claims/{cid}/submit").json()["claim"]
    assert not {"fraud", "risk_score", "risk_band", "audit", "internal_notes"} & set(claim)


def test_submit_validates_and_only_once():
    r = rahul()
    body = draft_body(rahul_policy()["policy_no"])
    body["incident"] = {**body["incident"], "narrative": "short", "location_text": ""}
    cid = r.post("/api/claims", json=body).json()["id"]
    res = r.post(f"/api/claims/{cid}/submit")
    assert res.status_code == 422
    assert set(res.json()["detail"]["fields"]) == {"incident.narrative", "incident.location_text", "media"}
    patched = r.patch(f"/api/claims/{cid}", json={"incident": {"narrative": SAMPLE["claim"]["incident"]["narrative"], "location_text": "Andheri"}})
    assert patched.status_code == 200 and patched.json()["incident"]["location"]["text"] == "Andheri"
    upload(r, cid, "front.jpg", "photo", "front")
    assert r.post(f"/api/claims/{cid}/submit").status_code == 200
    assert r.post(f"/api/claims/{cid}/submit").status_code == 409
    assert r.patch(f"/api/claims/{cid}", json={"claim_type": "Glass"}).status_code == 409


def test_customers_cannot_file_on_someone_elses_policy():
    other = next(p for p in read_json_sync("policies.json", []) if p["customer_id"] != "c_0001")
    assert rahul().post("/api/claims", json=draft_body(other["policy_no"])).status_code == 404
    assert admin().post("/api/claims", json=draft_body(other["policy_no"])).status_code == 201  # admins file on behalf of anyone


def test_delete_upload_from_a_draft_removes_its_files(uploads_dir):
    r = rahul()
    cid = r.post("/api/claims", json=draft_body(rahul_policy()["policy_no"])).json()["id"]
    media_id = upload(r, cid, "closeup.jpg", "photo", "closeup").json()["id"]
    assert any(f.name.startswith(media_id) for f in (uploads_dir / cid).iterdir())
    assert r.delete(f"/api/uploads/{cid}/{media_id}").status_code == 200
    assert not any(f.name.startswith(media_id) for f in (uploads_dir / cid).iterdir())
    assert r.get(f"/api/claims/{cid}").json()["media"] == []


def test_bad_files_and_path_traversal_are_rejected():
    r = rahul()
    cid = r.post("/api/claims", json=draft_body(rahul_policy()["policy_no"])).json()["id"]
    bad = r.post(f"/api/uploads/{cid}", files={"file": ("notes.txt", b"hello", "text/plain")}, data={"kind": "photo"})
    assert bad.status_code == 422
    fake = r.post(f"/api/uploads/{cid}", files={"file": ("x.jpg", b"not an image", "image/jpeg")}, data={"kind": "photo"})
    assert fake.status_code == 422
    for name in ("..%2F..%2Fdata%2Fusers.json", "%2E%2E", "missing.webp"):
        assert r.get(f"/api/files/{cid}/{name}").status_code == 404
    # Seeded claims have no uploads folder; the endpoint still answers 404, never a server error.
    seeded = next(c["id"] for c in read_json_sync("claims.json", []) if c["customer_id"] == "c_0001" and c.get("origin") != "app")
    assert r.get(f"/api/files/{seeded}/m_1.webp").status_code == 404
