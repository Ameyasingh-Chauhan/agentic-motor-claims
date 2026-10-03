"""Catalogue of the user-provided photos in server/assets_src/photos/ (the only photo source; credit "Provided by user").

Running this file rebuilds server/data/stock_photo_manifest.json (via json_store); `build_stock_photos.py` then writes the
WebP files. Pixel width/height are read from each source file, so they are always exact.

Each photo: id (= source file stem), out category, vehicle type, body, colour, zone, view, incidents, severity, group,
damage boxes and number-plate boxes. box_2d = [ymin, xmin, ymax, xmax] normalised 0–1000 on the source image.
damage box: (part_code_suffix, damage_type, box_2d, kind)   kind: D = fresh damage, P = pre-existing
Clean photos (category "clean") carry no damage boxes, only plate boxes.
"""
D, P = "d", "p"


def photo(pid, category, vtype, body, colour, zone, view, incidents, severity, boxes=(), plates=(), group=None, model_key=None):
    return {"id": pid, "category": category, "vehicle_type": vtype, "body": body, "colour": colour, "zone": zone, "view": view,
            "incidents": list(incidents), "severity": severity, "boxes": list(boxes), "plates": [list(p) for p in plates],
            "group": group or pid, **({"model_key": model_key} if model_key else {})}


PHOTOS: list[dict] = [
    # ---------------- car front ----------------
    photo("car_front_01", "car-front", "Car", "hatch", "Black", "front", "front", ["front_collision", "animal"], "moderate",
          [("FBMP", "broken", [280, 0, 600, 480], D), ("BONT", "dent", [80, 230, 230, 560], D), ("GRIL", "crack", [300, 290, 460, 520], D)],
          [[330, 505, 430, 910]]),
    photo("car_front_02", "car-front", "Car", "suv", "Pearl White", "front", "front", ["front_collision", "animal"], "severe",
          [("BONT", "deformed", [230, 280, 330, 880], D), ("FBMP", "broken", [560, 370, 790, 720], D), ("HLMP", "broken", [280, 200, 400, 310], D),
           ("GRIL", "broken", [300, 290, 470, 580], D), ("AIRB", "deployed", [170, 620, 235, 800], D),
           ("BMRF", "oxidised fracture", [540, 540, 840, 720], P)]),  # hanging crash-beam bracket: the fastag_mismatch FR-02 story
    photo("car_front_03", "car-front", "Car", "sedan", "Blue", "front", "front", ["front_collision"], "severe",
          [("BONT", "deformed", [280, 230, 460, 830], D), ("HLMP", "broken", [440, 200, 620, 430], D), ("GRIL", "broken", [420, 380, 620, 720], D),
           ("FBMP", "broken", [600, 200, 840, 900], D), ("AIRB", "deployed", [50, 560, 200, 660], D)]),
    photo("car_front_04", "car-front", "Car", "sedan", "Pearl White", "front", "front", ["front_collision", "side_swipe"], "severe",
          [("BONT", "deformed", [330, 320, 660, 620], D), ("FNDR", "deformed", [330, 540, 570, 650], D), ("HLMP", "crack", [450, 510, 690, 640], D),
           ("FBMP", "scratch", [700, 420, 950, 690], D), ("WSCR", "crack", [100, 370, 450, 650], D)],
          [[880, 370, 945, 450]]),
    # ---------------- car rear ----------------
    photo("car_rear_01", "car-rear", "Car", "sedan", "Silver", "rear", "rear", ["rear_end"], "severe",
          [("RBMP", "deformed", [560, 0, 900, 720], D), ("QPNL", "deformed", [400, 500, 800, 880], D), ("TLMP", "broken", [170, 510, 490, 800], D)]),
    photo("car_rear_02", "car-rear", "Car", "hatch", "Pearl White", "rear", "rear", ["rear_end", "side_swipe"], "severe",
          [("QPNL", "deformed", [430, 200, 800, 700], D), ("RBMP", "broken", [700, 560, 900, 1000], D), ("TLMP", "broken", [690, 550, 790, 830], D),
           ("TLGT", "dent", [500, 690, 650, 1000], D)],
          [[680, 925, 770, 1000]]),
    photo("car_rear_03", "car-rear", "Car", "sedan", "Champagne", "rear", "rear", ["rear_end"], "severe",
          [("TLGT", "deformed", [200, 240, 560, 700], D), ("RBMP", "crushed", [520, 250, 880, 820], D), ("TLMP", "broken", [360, 210, 520, 330], D),
           ("QPNL", "deformed", [230, 600, 700, 960], D)],
          [[400, 450, 510, 600]]),
    # ---------------- car side ----------------
    photo("car_side_01", "car-side", "Car", "any", "Grey", "left", "left", ["side_swipe", "parking_scrape"], "moderate",
          [("FDOR", "dent", [250, 80, 810, 620], D), ("RDOR", "dent", [250, 600, 810, 900], D)]),
    photo("car_side_02", "car-side", "Car", "any", "Black", "left", "left", ["side_swipe"], "severe",
          [("FDOR", "torn", [300, 400, 880, 920], D)]),
    {**photo("car_side_03", "car-side", "Car", "hatch", "Blue", "left", "left", ["side_swipe"], "moderate",
             [("RDOR", "deformed", [300, 170, 680, 340], D), ("FDOR", "deformed", [300, 330, 690, 510], D)]),
     "crop": [0, 0, 925, 1000]},  # drops the stock-site footer strip
    # ---------------- scratches / lamps / glass (close-ups) ----------------
    photo("scratch_01", "closeup", "Car", "any", "Brown", "left", "closeup", ["parking_scrape", "side_swipe"], "minor",
          [("FNDR", "dent", [300, 380, 860, 760], D)]),
    photo("scratch_02", "closeup", "Car", "hatch", "Black", "left", "closeup", ["parking_scrape", "side_swipe"], "minor",
          [("RDOR", "scratch", [420, 450, 800, 1000], D), ("QPNL", "scratch", [350, 170, 600, 500], D)]),
    photo("lamp_front_01", "closeup", "Car", "any", "Black", "front", "closeup", ["front_collision", "animal"], "moderate",
          [("HLMP", "broken", [180, 190, 560, 700], D), ("FNDR", "scratch", [150, 700, 500, 1000], D), ("FBMP", "scratch", [550, 300, 900, 800], D)]),
    photo("lamp_tail_01", "closeup", "Car", "any", "Red", "rear", "closeup", ["rear_end", "parking_scrape"], "minor",
          [("TLMP", "crack", [410, 280, 560, 700], D)]),
    photo("glass_01", "windshield", "Car", "any", "Pearl White", "glass", "closeup", ["glass"], "moderate",
          [("WSCR", "shattered", [130, 170, 950, 1000], D)]),
    photo("glass_02", "windshield", "Car", "any", "Silver", "glass", "closeup", ["glass"], "severe",
          [("WSCR", "shattered", [90, 30, 740, 990], D)]),
    # ---------------- flood ----------------
    photo("flood_01", "flood", "Car", "hatch", "Pearl White", "front", "front", ["flood"], "severe",
          [("FBMP", "submerged", [600, 330, 760, 600], D), ("HLMP", "water damage", [520, 480, 640, 560], D)],
          [[700, 420, 760, 500]]),
    # ---------------- two-wheelers ----------------
    photo("tw_01", "two-wheeler", "2W", "scooter", "Black", "right", "right", ["skid_fall", "front_collision", "side_swipe"], "severe",
          [("HLMP", "broken", [170, 500, 290, 680], D), ("FPNL", "broken", [290, 540, 720, 750], D), ("SPNL", "broken", [300, 200, 720, 500], D),
           ("CGRD", "bent", [580, 620, 780, 780], D)]),
    photo("tw_02", "two-wheeler", "2W", "scooter", "Red", "front", "front", ["skid_fall", "front_collision"], "severe",
          [("HLMP", "broken", [260, 160, 500, 480], D), ("FPNL", "broken", [100, 280, 790, 580], D), ("FMDG", "dent", [500, 90, 750, 350], D)]),
    # ---------------- commercial ----------------
    photo("cv_01", "commercial", "CV", "lcv", "Pearl White", "front", "front", ["front_collision"], "severe",
          [("FPNL", "dent", [180, 250, 480, 800], D), ("FBMP", "deformed", [690, 350, 960, 880], D), ("HLMP", "broken", [480, 800, 760, 950], D)],
          [[600, 620, 700, 780]]),
    # ---------------- clean vehicles (theft / reference thumbnails): no damage boxes ----------------
    photo("clean_hatch", "clean", "Car", "hatch", "Red", "overall", "overall", [], "none", plates=[[565, 600, 612, 692]], model_key="MAR-SWI"),
    photo("clean_sedan", "clean", "Car", "sedan", "Red", "overall", "overall", [], "none", plates=[[530, 240, 590, 340]], model_key="MAR-DZI"),
    photo("clean_suv", "clean", "Car", "suv", "Pearl White", "overall", "overall", [], "none", plates=[[570, 765, 625, 825]]),
    photo("clean_scooter", "clean", "2W", "scooter", "Blue", "overall", "overall", [], "none", plates=[[420, 645, 505, 715]]),
    # Royal Enfield Classic 350, right side; the rear plate is edge-on (unreadable), so no plate box.
    photo("clean_motorcycle", "clean", "2W", "motorcycle", "Black", "overall", "overall", [], "none", model_key="ROY-CLA"),
    {**photo("clean_cv", "clean", "CV", "lcv", "Pearl White", "overall", "overall", [], "none", plates=[[575, 760, 620, 800]], model_key="MAH-BPU"),
     "crop": [0, 100, 1000, 905]},  # drops the white side bars
]


def crop_box(box: list[int], crop: list[int]) -> list[int]:
    """A source-image box_2d expressed relative to a crop (both 0–1000), clipped to the crop."""
    cy0, cx0, cy1, cx1 = crop
    y0, x0, y1, x1 = box

    def f(v, a, b):
        return max(0, min(1000, round((v - a) / (b - a) * 1000)))
    return [f(y0, cy0, cy1), f(x0, cx0, cx1), f(y1, cy0, cy1), f(x1, cx0, cx1)]


# ------------------------------------------------------------------------------------------------
# Build the manifest
# ------------------------------------------------------------------------------------------------

def build_manifest() -> dict:
    """Resolve each catalogued photo against its source file and write stock_photo_manifest.json (preserving build output)."""
    import sys
    from pathlib import Path

    from PIL import Image, ImageOps, UnidentifiedImageError

    server = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(server))
    from app.services.json_store import read_json_sync, write_json_sync
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import reference_data as R

    src_dir = server / "assets_src" / "photos"
    files, unreadable = {}, []
    for f in sorted(src_dir.iterdir()):
        if f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp", ".avif"):
            continue
        try:
            with Image.open(f) as im:
                files[f.stem] = (f, ImageOps.exif_transpose(im).size)
        except UnidentifiedImageError:
            unreadable.append(f.name)  # e.g. a web page saved with a .jpg name
    previous = {p["id"]: p for p in (read_json_sync("stock_photo_manifest.json", {}) or {}).get("photos", [])}
    photos = []
    for ph in PHOTOS:
        if ph["id"] not in files:
            raise SystemExit(f"{ph['id']}: no readable source file in {src_dir}")
        src, (w, h) = files[ph["id"]]
        ph = dict(ph)
        if ph.get("crop"):  # boxes are catalogued on the source image; re-express them relative to the crop
            ph["boxes"] = [(c, d, crop_box(b, ph["crop"]), k) for c, d, b, k in ph["boxes"]]
            ph["plates"] = [crop_box(b, ph["crop"]) for b in ph["plates"]]
            cy0, cx0, cy1, cx1 = ph["crop"]
            w, h = round(w * (cx1 - cx0) / 1000), round(h * (cy1 - cy0) / 1000)
        parts = R.PARTS_BY_TYPE[ph["vehicle_type"]]
        for code, *_ in ph["boxes"]:
            if code not in parts:
                raise SystemExit(f"{ph['id']}: part {code} is not a {ph['vehicle_type']} part")
        if ph["category"] == "clean" and ph["boxes"]:
            raise SystemExit(f"{ph['id']}: clean photos carry no damage boxes")
        entry = {**ph, "source": "user", "file": src.name, "source_width": w, "source_height": h,
                 "boxes": [{"part": code, "damage_type": dmg, "box_2d": list(box), "kind": "pre_existing" if kind == P else "damage",
                            "label": f"{parts[code][0]} · {dmg}"} for code, dmg, box, kind in ph["boxes"]]}
        if ph["id"] in previous:  # keep fields written by `build_stock_photos.py` (url, thumb, blur, credit…)
            entry |= {k: v for k, v in previous[ph["id"]].items() if k not in entry}
        photos.append(entry)
    unused = sorted(set(files) - {p["id"] for p in PHOTOS})
    if unused:
        print("Not catalogued:", ", ".join(unused))
    if unreadable:
        print("Not an image (skipped):", ", ".join(unreadable))
    manifest = {"about": "User-provided photos (server/assets_src/photos/) with hand-placed damage and plate boxes "
                         "(box_2d = [ymin, xmin, ymax, xmax], 0–1000). Edit server/scripts/stock_curation.py, then run it and "
                         "`build_stock_photos.py`.",
                "photos": photos}
    write_json_sync("stock_photo_manifest.json", manifest)
    return manifest


if __name__ == "__main__":
    sys_ = __import__("sys")
    sys_.stdout.reconfigure(encoding="utf-8")
    m = build_manifest()
    print(f"stock_photo_manifest.json: {len(m['photos'])} photos")
