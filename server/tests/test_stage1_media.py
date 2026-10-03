"""Stage 1 (§18 photos, §11.2 media/documents): catalogue, built images and what the seed put on each claim.

These read the real outputs of scripts/stock_curation.py, build_stock_photos.py and seed.py, so run the seed first.
"""
import json
import sys
from pathlib import Path

import pytest
from PIL import Image, UnidentifiedImageError

from app.services.json_store import read_json_sync

SERVER = Path(__file__).resolve().parents[1]
PUBLIC = SERVER.parent / "client" / "public"
SOURCES = SERVER / "assets_src" / "photos"
DOCS = PUBLIC / "assets" / "documents"
sys.path.insert(0, str(SERVER / "scripts"))
from seed_media import BODY_BY_MODEL  # noqa: E402
from stock_curation import PHOTOS  # noqa: E402

SCENARIOS = ("clean_rear_end", "fastag_mismatch", "garage_overquote", "theft_two_wheeler", "flood_total_loss")


@pytest.fixture(scope="module")
def manifest():
    return {p["id"]: p for p in read_json_sync("stock_photo_manifest.json", {})["photos"]}


@pytest.fixture(scope="module")
def claims():
    return read_json_sync("claims.json", [])


def on_disk(url: str | None) -> bool:
    return bool(url) and (PUBLIC / url.lstrip("/")).is_file()


def valid_box(box) -> bool:
    y0, x0, y1, x1 = box
    return all(0 <= v <= 1000 for v in box) and y0 < y1 and x0 < x1


def photos_of(claim: dict) -> list[dict]:
    return [m for m in claim["media"] if m["kind"] == "photo"]


# ---------------- catalogue + build ----------------

def test_every_source_photo_is_a_readable_image_and_catalogued(manifest):
    stems = set()
    for f in SOURCES.iterdir():
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".avif"):
            try:
                with Image.open(f) as im:
                    im.verify()
            except UnidentifiedImageError:
                pytest.fail(f"{f.name} is not an image")
            stems.add(f.stem)
    assert stems == {p["id"] for p in PHOTOS} == set(manifest)


def test_manifest_boxes_and_plates_are_well_formed(manifest):
    for p in manifest.values():
        for b in p["boxes"]:
            assert valid_box(b["box_2d"]), (p["id"], b)
            assert b["kind"] in ("damage", "pre_existing")
        for plate in p["plates"]:
            assert valid_box(plate), (p["id"], plate)
        if p["category"] == "clean":
            assert not p["boxes"], p["id"]
        else:
            assert p["boxes"], f"{p['id']} is a damage photo with no damage box"


def test_built_images_exist_match_manifest_and_are_credited(manifest):
    credits = json.loads((PUBLIC / "assets" / "stock" / "CREDITS.json").read_text(encoding="utf-8"))["images"]
    assert {c["id"] for c in credits} == set(manifest)
    for p in manifest.values():
        assert p["available"] and on_disk(p["url"]) and on_disk(p["thumb"]), p["id"]
        with Image.open(PUBLIC / p["url"].lstrip("/")) as im:
            assert im.size == (p["width"], p["height"]), p["id"]
            assert max(im.size) <= 1600
            assert not im.getexif(), f"{p['id']} still carries EXIF metadata"
    # No leftover placeholders or files from earlier photo sets.
    built = {f.relative_to(PUBLIC).as_posix() for f in (PUBLIC / "assets" / "stock").rglob("*.webp")}
    assert built == {u.lstrip("/") for p in manifest.values() for u in (p["url"], p["thumb"])}


def test_fastag_photo_carries_the_pre_existing_bracket_box(manifest):
    kinds = {(b["part"], b["kind"]) for b in manifest["car_front_02"]["boxes"]}
    assert ("BMRF", "pre_existing") in kinds


# ---------------- what the seed put on the claims ----------------

def test_claim_photos_and_thumbnails_exist(claims):
    for c in claims:
        assert on_disk(c["vehicle"]["thumb"]), c["id"]
        for m in photos_of(c):
            assert on_disk(m["url"]) and on_disk(m["thumb"]), (c["id"], m["id"])


def test_every_seeded_box_is_a_catalogued_box_on_one_of_the_claims_photos(claims, manifest):
    """Boxes come from the hand-placed catalogue, so each one sits on visible damage on a photo the claim really has."""
    n = 0
    for c in claims:
        stock = {m["id"]: m.get("stock_id") for m in photos_of(c)}
        boxes = [b for it in c["damage"]["items"] for b in it.get("boxes", [])]
        boxes += [b for pe in c["damage"].get("pre_existing", []) for b in pe.get("boxes", [])]
        for b in boxes:
            assert b["photo_id"] in stock, (c["id"], b)
            assert valid_box(b["box_2d"])
            assert b["box_2d"] in [mb["box_2d"] for mb in manifest[stock[b["photo_id"]]]["boxes"]], (c["id"], b)
            n += 1
        # Paired parts (left/right headlamps…) share a part code; one visible box must not be drawn twice.
        keys = [(b["photo_id"], tuple(b["box_2d"])) for it in c["damage"]["items"] for b in it.get("boxes", [])]
        assert len(keys) == len(set(keys)), f"{c['id']} draws the same box twice"
    assert n > 200


def test_scenarios_use_distinct_curated_photos(claims):
    by_scenario = {c["scenario_id"]: c for c in claims if c.get("scenario_id")}
    assert set(by_scenario) == set(SCENARIOS)
    sets = {s: {m["stock_id"] for m in photos_of(c)} for s, c in by_scenario.items()}
    assert all(sets.values())
    for a in SCENARIOS:
        for b in SCENARIOS:
            assert a == b or not (sets[a] & sets[b]), (a, b)
    assert sets["theft_two_wheeler"] == {"clean_scooter"}
    fastag = by_scenario["fastag_mismatch"]["damage"]
    assert any(not it["fresh"] and it["boxes"] for it in fastag["items"])
    assert fastag["pre_existing"] and all(pe["boxes"] for pe in fastag["pre_existing"])


def test_two_wheeler_photos_match_the_body_type(claims, manifest):
    models = {(m["make"], m["model"]): m["key"] for m in read_json_sync("vehicle_models.json", [])}
    seen = set()
    for c in claims:
        if c["vehicle"]["type"] != "2W":
            continue
        body = BODY_BY_MODEL[models[(c["vehicle"]["make"], c["vehicle"]["model"])]]
        seen.add(body)
        thumb = next(p for p in manifest.values() if p["thumb"] == c["vehicle"]["thumb"])
        assert thumb["category"] == "clean" and thumb["body"] == body, (c["id"], thumb["id"])
        if c["claim_type"] == "TP":  # photos show the third party's car
            continue
        for m in photos_of(c):
            assert manifest[m["stock_id"]]["body"] in (body, "any"), (c["id"], m["stock_id"])
    assert seen == {"scooter", "motorcycle"}


def test_third_party_claims_are_never_own_vehicle_total_loss(claims, manifest):
    tp = [c for c in claims if c["claim_type"] == "TP"]
    assert tp
    assert not any(c["financials"]["total_loss_check"]["is_total_loss"] for c in tp)
    # Every non-TP claim's photos show a vehicle of the insured vehicle's own type (a 2W total loss never shows a car).
    for c in claims:
        if c["claim_type"] != "TP":
            for m in photos_of(c):
                assert manifest[m["stock_id"]]["vehicle_type"] == c["vehicle"]["type"], (c["id"], c["claim_type"], m["stock_id"])


# ---------------- documents ----------------

def test_document_files_exist_with_no_leftovers(claims):
    referenced = {u.lstrip("/") for c in claims for d in c["documents"] for u in (d.get("url"), d.get("thumb")) if u}
    assert len(referenced) > 1000
    on_disk_files = {f.relative_to(PUBLIC).as_posix() for f in DOCS.rglob("*") if f.is_file()}
    assert referenced == on_disk_files  # every URL resolves, and nothing stale is left behind
    assert {d.name for d in DOCS.iterdir()} <= {c["id"] for c in claims}
    assert not (PUBLIC / "assets" / "documents.__building__").exists(), "an interrupted seed left its temp folder"


def test_no_aadhaar_or_pan_images(claims):
    """KYC is a registry lookup with masked numbers and no image (with the test above, no file on disk can be a KYC scan)."""
    kyc = [d for c in claims for d in c["documents"] if d["type"] == "KYC"]
    assert kyc
    for d in kyc:
        assert d["url"] is None and d["thumb"] is None
        assert d["extracted"]["aadhaar"].startswith("XXXX-XXXX-") and d["extracted"]["pan"].startswith("XXXXX")
