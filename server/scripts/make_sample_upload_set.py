"""Bundled sample set for an in-app claim (Phase 3B Stage 2): used by the Dev Tools "Create sample in-app claim" button and by the
backend integration test, both of which send these files through the real multipart upload endpoint.

    python scripts/make_sample_upload_set.py

Writes client/public/assets/samples/in-app-claim/:
  front.jpg, closeup.jpg  ONE real user-provided photo of a black Maruti Suzuki Baleno (car_front_01) — the full front view and a
                          close-up crop of the damaged corner — so both photos honestly show the same, insured vehicle. Plate
                          blurred; camera EXIF: capture time, GPS (Andheri, Mumbai), device
  rc.jpg, dl.jpg          SPECIMEN RC and driving licence for the sample vehicle/customer (watermarked, same renderer as the seed)
  sample.json             policy, incident and file list for the flow

The sample vehicle is the first active black Maruti Baleno (OD+TP) policy in policies.json — the photo shows a black Baleno
(Suzuki grille, Baleno headlamp), so the live vehicle-identity check can confirm it. The garage is a cashless network multibrand
workshop that services Maruti. Re-run this script after a re-seed so the policy number stays valid.
"""
from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta
from fractions import Fraction
from pathlib import Path

from PIL import Image, ImageOps

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.services.json_store import read_json_sync  # noqa: E402
from build_stock_photos import blur_regions  # noqa: E402
import make_specimen_docs as docs  # noqa: E402
from seed_documents import driving_licence  # noqa: E402

OUT = SERVER.parent / "client" / "public" / "assets" / "samples" / "in-app-claim"
CAPTURED = datetime(2026, 10, 3, 18, 42, 0)          # camera local time (IST); in the past so a filed claim validates
GPS = (19.1408, 72.8297)                             # Lokhandwala, Andheri West, Mumbai
DEVICE = ("samsung", "Galaxy S23")
GARAGE_ID = "g_008"                                  # Swaminathan Auto Works, Thane — multibrand, cashless network, services Maruti
# (file, stock photo, slot, caption, crop [ymin, xmin, ymax, xmax] 0–1000 of the processed photo or None)
PHOTOS = [("front.jpg", "car_front_01", "front", "Front of the car after hitting the gate pillar", None),
          ("closeup.jpg", "car_front_01", "closeup", "Close-up of the damaged right headlamp and bumper corner", (110, 0, 640, 620))]


def _dms(value: float) -> tuple:
    v = abs(value)
    d, m = int(v), int((v - int(v)) * 60)
    s = round((v - d - m / 60) * 3600, 2)
    return (Fraction(d), Fraction(m), Fraction(s).limit_denominator(100))


def exif_for(when: datetime) -> Image.Exif:
    exif = Image.Exif()
    stamp = when.strftime("%Y:%m:%d %H:%M:%S")
    exif[271], exif[272], exif[306] = DEVICE[0], DEVICE[1], stamp
    sub = exif.get_ifd(0x8769)
    sub[36867] = sub[36868] = stamp
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2] = "N", _dms(GPS[0])
    gps[3], gps[4] = "E", _dms(GPS[1])
    return exif


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    manifest = {p["id"]: p for p in read_json_sync("stock_photo_manifest.json", {})["photos"]}
    vehicles = {v["id"]: v for v in read_json_sync("vehicles.json", [])}
    customers = {c["id"]: c for c in read_json_sync("customers.json", [])}
    policy = next(p for p in read_json_sync("policies.json", []) if p["status"] == "active" and p["cover"] == "OD+TP"
                  and vehicles[p["vehicle_id"]]["model_key"] == "MAR-BAL" and vehicles[p["vehicle_id"]]["colour"] == "Black")
    vehicle, customer = vehicles[policy["vehicle_id"]], customers[policy["customer_id"]]
    OUT.mkdir(parents=True, exist_ok=True)

    files = []
    for i, (name, stock_id, slot, caption, view) in enumerate(PHOTOS):
        entry = manifest[stock_id]
        src = ImageOps.exif_transpose(Image.open(SERVER / "assets_src" / "photos" / entry["file"])).convert("RGB")
        if entry.get("crop"):
            y0, x0, y1, x1 = entry["crop"]
            src = src.crop((x0 * src.width // 1000, y0 * src.height // 1000, x1 * src.width // 1000, y1 * src.height // 1000))
        im = blur_regions(src, entry.get("plates", []))
        if view:
            y0, x0, y1, x1 = view
            im = im.crop((x0 * im.width // 1000, y0 * im.height // 1000, x1 * im.width // 1000, y1 * im.height // 1000))
        im.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
        im.save(OUT / name, "JPEG", quality=88, exif=exif_for(CAPTURED + timedelta(seconds=40 * i)))
        files.append({"path": name, "kind": "photo", "slot": slot, "caption": caption})

    rc = {"type": "RC", "extracted": {
        "registration": vehicle["registration"], "owner": customer["name"], "address": customer["address"],
        "make_model": f"{vehicle['make']} {vehicle['model']}", "variant": vehicle.get("variant"), "fuel": vehicle["fuel"], "cc": vehicle["cc"],
        "colour": vehicle["colour"], "chassis": vehicle["chassis"], "engine": vehicle["engine"], "registered_on": vehicle["registered_on"],
        "authority": f"RTO {customer['city']} ({vehicle['registration'][:5]})", "vehicle_class": "LMV (Motor car)", "hypothecation": None}}
    docs.render(rc, "SAMPLE").convert("RGB").save(OUT / "rc.jpg", "JPEG", quality=90)
    files.append({"path": "rc.jpg", "kind": "document", "slot": "rc", "caption": "RC copy"})
    lic = driving_licence(random.Random(2026), customer, vehicle["registration"][:5], "Car", CAPTURED, expired=False)
    docs.render({"type": "DL", "extracted": lic}, "SAMPLE").convert("RGB").save(OUT / "dl.jpg", "JPEG", quality=90)
    files.append({"path": "dl.jpg", "kind": "document", "slot": "dl", "caption": "Driving licence"})

    incident_at = CAPTURED - timedelta(minutes=25)
    sample = {
        "about": "Sample in-app claim (Dev Tools + integration test). Generated by server/scripts/make_sample_upload_set.py.",
        "policy_no": policy["policy_no"], "registration": vehicle["registration"], "customer_name": customer["name"],
        "vehicle": f"{vehicle['make']} {vehicle['model']} · {vehicle['colour']}",
        "claim": {"claim_type": "OD", "channel": "app", "garage_id": GARAGE_ID, "incident": {
            "type": "front_collision", "datetime": incident_at.strftime("%Y-%m-%dT%H:%M:00+05:30"),
            "location_text": "Housing society gate, Lokhandwala, Andheri West", "city": "Mumbai", "lat": GPS[0], "lng": GPS[1],
            "narrative": "As I turned slowly into my housing society compound in Lokhandwala, an electric kick-scooter rider cut across "
                         "in front of me. I swerved to avoid him and hit the concrete gate pillar with the front right corner of the car. "
                         "He jumped off and was not hurt; his scooter fell and is lying in front of my car. The front bumper is torn, "
                         "the right headlamp is broken and the bonnet is dented.",
            "narrative_language": "en", "third_party_involved": True, "injuries": False}},
        "files": files,
    }
    (OUT / "sample.json").write_text(json.dumps(sample, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Sample set for {policy['policy_no']} ({vehicle['registration']}, {customer['name']}) → {OUT}")
    for f in files:
        print(f"  {f['path']:<12} {(OUT / f['path']).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
