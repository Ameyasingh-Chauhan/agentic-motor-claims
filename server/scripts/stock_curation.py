"""Curated picks + hand-placed boxes. Builds server/data/stock_photo_manifest.json (via json_store).

Each pick: (id, candidate_category, n, out_category, vehicle_type, zone, view, incidents, severity, boxes, plates)
box: (part_code_suffix, damage_type, [ymin, xmin, ymax, xmax], kind)  kind: d = damage, p = pre-existing
"""
D, P = "d", "p"

PICKS = [
    # ---------------- car front ----------------
    ("car_front_01", "car-front", 21, "car-front", "Car", "front", "front", ["front_collision", "animal"], "severe",
     [("BONT", "dent", [260, 120, 530, 700], D), ("HLMP", "broken", [450, 520, 620, 720], D), ("WSCR", "shattered", [90, 280, 270, 690], D)],
     [[740, 240, 860, 380]]),
    ("car_front_02", "car-front", 28, "car-front", "Car", "front", "front", ["front_collision"], "severe",
     [("FBMP", "broken", [600, 170, 860, 620], D), ("BMRF", "deformed", [650, 360, 830, 600], D), ("GRIL", "broken", [420, 190, 580, 380], D)],
     [[360, 90, 410, 140]]),
    ("car_front_03", "car-front", 42, "car-front", "Car", "left", "left", ["front_collision", "side_swipe"], "severe",
     [("FNDR", "deformed", [560, 250, 800, 560], D), ("BONT", "deformed", [520, 180, 640, 520], D), ("FBMP", "broken", [620, 120, 780, 330], D)],
     []),
    ("car_front_04", "car-front", 54, "car-front", "Car", "front", "front", ["front_collision"], "severe",
     [("BONT", "deformed", [420, 230, 580, 500], D), ("FBMP", "deformed", [540, 180, 690, 500], D)],
     [[660, 250, 730, 400]]),
    ("car_front_05", "car-front", 30, "closeup", "Car", "front", "closeup", ["front_collision"], "moderate",
     [("FBMP", "crack", [430, 0, 880, 700], D), ("BMRF", "oxidised fracture", [420, 440, 640, 660], P)],
     []),
    ("car_front_06", "car-front", 31, "car-front", "Car", "front", "left", ["front_collision"], "severe",
     [("FBMP", "broken", [560, 70, 800, 330], D), ("FNDR", "dent", [520, 280, 780, 380], D)],
     [[660, 100, 720, 170]]),
    ("car_front_07", "car-front", 52, "car-front", "Car", "front", "front", ["front_collision", "animal"], "moderate",
     [("HLMP", "broken", [590, 320, 690, 400], D), ("FBMP", "crack", [640, 300, 800, 440], D), ("FNDR", "dent", [540, 380, 740, 450], D)],
     [[740, 160, 790, 270]]),
    ("car_front_08", "car-front", 70, "closeup", "Car", "front", "closeup", ["front_collision"], "severe",
     [("FBMP", "broken", [460, 0, 1000, 750], D), ("BMRF", "deformed", [380, 490, 560, 640], D), ("BONT", "deformed", [190, 0, 360, 1000], D)],
     []),
    ("car_front_09", "car-front", 71, "car-front", "Car", "front", "left", ["front_collision"], "moderate",
     [("BONT", "deformed", [330, 480, 520, 860], D), ("FBMP", "crack", [480, 780, 640, 860], D)],
     []),
    ("car_front_10", "car-front", 73, "car-front", "Car", "front", "front", ["front_collision"], "severe",
     [("BONT", "deformed", [310, 200, 560, 860], D), ("GRIL", "broken", [470, 580, 700, 870], D), ("HLMP", "crack", [470, 300, 600, 560], D),
      ("FBMP", "scratch", [600, 300, 900, 880], D)],
     []),
    ("car_front_11", "car-front", 74, "car-front", "Car", "front", "front", ["front_collision", "animal"], "severe",
     [("BONT", "dent", [450, 100, 700, 580], D), ("HLMP", "broken", [600, 380, 820, 560], D), ("WSCR", "shattered", [130, 250, 400, 620], D),
      ("FBMP", "crack", [700, 40, 950, 600], D)],
     [[880, 150, 950, 300]]),
    # ---------------- glass ----------------
    ("glass_01", "car-front", 12, "windshield", "Car", "glass", "closeup", ["glass"], "moderate",
     [("WSCR", "shattered", [250, 230, 850, 940], D)], []),
    ("glass_02", "car-front", 22, "windshield", "Car", "glass", "closeup", ["glass"], "severe",
     [("WSCR", "shattered", [60, 140, 980, 1000], D)], []),
    # ---------------- car rear ----------------
    ("car_rear_01", "car-front", 118, "car-rear", "Car", "rear", "rear", ["rear_end", "parking_scrape"], "minor",
     [("RBMP", "scratch", [580, 290, 720, 410], D), ("QPNL", "dent", [520, 330, 690, 440], D)],
     [[480, 150, 530, 250]]),
    ("car_rear_02", "car-rear", 30, "car-rear", "Car", "rear", "rear", ["rear_end"], "severe",
     [("TLGT", "deformed", [330, 160, 500, 600], D), ("RBMP", "deformed", [580, 100, 720, 620], D), ("TLMP", "broken", [480, 130, 620, 230], D)],
     [[450, 310, 530, 420]]),
    ("car_rear_03", "car-rear", 52, "car-rear", "Car", "rear", "rear", ["rear_end", "side_swipe"], "severe",
     [("RBMP", "broken", [580, 180, 830, 560], D), ("QPNL", "deformed", [300, 420, 700, 650], D), ("TLMP", "broken", [520, 450, 620, 510], D)],
     []),
    ("car_rear_04", "car-rear", 56, "car-rear", "Car", "rear", "rear", ["rear_end"], "severe",
     [("RBMP", "broken", [650, 280, 880, 720], D), ("QPNL", "dent", [450, 630, 800, 720], D), ("TLMP", "broken", [440, 620, 560, 710], D)],
     [[500, 440, 570, 520], [340, 780, 370, 820]]),
    ("car_rear_05", "car-rear", 60, "closeup", "Car", "rear", "closeup", ["rear_end", "parking_scrape"], "minor",
     [("RBMP", "broken", [270, 160, 620, 1000], D)],
     [[0, 300, 140, 600]]),
    ("car_rear_06", "car-rear", 35, "closeup", "Car", "rear", "closeup", ["rear_end"], "severe",
     [("QPNL", "deformed", [350, 560, 700, 1000], D), ("TLMP", "crack", [580, 810, 690, 930], D)],
     []),
    ("car_front_12", "car-rear", 25, "car-front", "Car", "front", "front", ["front_collision"], "severe",
     [("FBMP", "broken", [500, 170, 1000, 600], D), ("HLMP", "broken", [420, 180, 560, 280], D), ("FNDR", "torn", [380, 450, 600, 620], D)],
     [[670, 230, 760, 330]]),
    # ---------------- car side ----------------
    ("car_side_01", "car-side", 5, "car-side", "Car", "left", "left", ["side_swipe", "front_collision"], "moderate",
     [("BONT", "deformed", [330, 560, 500, 880], D), ("DGLS", "shattered", [200, 250, 450, 420], D), ("HLMP", "crack", [450, 780, 560, 880], D)],
     []),
    ("car_side_02", "car-side", 4, "car-side", "Car", "rear", "rear", ["side_swipe", "rear_end"], "moderate",
     [("DGLS", "shattered", [180, 600, 400, 800], D), ("RBMP", "scratch", [580, 0, 730, 480], D)],
     [[480, 150, 560, 280]]),
    ("car_side_03", "car-side", 53, "car-side", "Car", "left", "left", ["side_swipe"], "severe",
     [("FDOR", "deformed", [250, 250, 850, 600], D), ("DGLS", "shattered", [100, 240, 400, 480], D)],
     []),
    # ---------------- commercial ----------------
    ("cv_01", "car-side", 25, "commercial", "CV", "right", "right", ["side_swipe", "front_collision"], "severe",
     [("CDOR", "torn", [360, 440, 760, 640], D), ("LBSD", "deformed", [300, 630, 690, 970], D)],
     []),
    ("cv_02", "car-side", 27, "commercial", "CV", "left", "closeup", ["side_swipe", "pothole"], "moderate",
     [("LBSD", "dent", [430, 0, 720, 560], D), ("TYRE", "burst", [570, 230, 1000, 720], D)],
     []),
    # ---------------- scratches ----------------
    ("scratch_01", "scratch", 7, "closeup", "Car", "left", "closeup", ["parking_scrape", "side_swipe"], "minor",
     [("FNDR", "scratch", [290, 520, 720, 770], D)], []),
    ("scratch_02", "scratch", 14, "car-side", "Car", "left", "left", ["parking_scrape", "side_swipe"], "minor",
     [("RDOR", "scratch", [80, 100, 400, 460], D), ("FDOR", "scratch", [300, 400, 650, 950], D)], []),

    ("car_side_04", "car-side", 191, "car-side", "Car", "left", "left", ["side_swipe"], "severe",
     [("FDOR", "deformed", [250, 150, 800, 400], D), ("RDOR", "dent", [280, 380, 760, 620], D), ("FNDR", "deformed", [300, 0, 650, 170], D)], []),
    ("car_side_05", "car-side", 192, "car-side", "Car", "right", "right", ["side_swipe"], "moderate",
     [("FDOR", "dent", [300, 400, 950, 770], D), ("DGLS", "shattered", [80, 330, 560, 680], D), ("FNDR", "scratch", [480, 740, 760, 880], D)], []),
    ("car_side_06", "car-side", 156, "closeup", "Car", "left", "closeup", ["side_swipe"], "moderate",
     [("DGLS", "shattered", [80, 280, 700, 680], D)], []),
    ("glass_03", "car-side", 186, "windshield", "Car", "glass", "closeup", ["glass"], "moderate",
     [("WSCR", "crack", [80, 20, 950, 960], D)], []),
    ("car_rear_07", "car-side", 145, "closeup", "Car", "rear", "closeup", ["rear_end", "side_swipe"], "moderate",
     [("QPNL", "corroded", [430, 330, 720, 950], P)], []),
    ("car_front_13", "car-side", 233, "car-front", "Car", "front", "front", ["front_collision"], "severe",
     [("BONT", "deformed", [370, 350, 520, 980], D), ("FBMP", "torn", [600, 450, 920, 990], D), ("HLMP", "broken", [480, 520, 600, 680], D)], []),
    ("car_front_14", "car-side", 165, "car-front", "Car", "front", "front", ["front_collision"], "severe",
     [("ROOF", "crushed", [80, 100, 330, 780], D), ("WSCR", "shattered", [300, 250, 700, 780], D)], []),
    # ---------------- lamps ----------------
    ("lamp_01", "lamp", 4, "closeup", "Car", "front", "closeup", ["front_collision", "animal"], "moderate",
     [("HLMP", "crack", [250, 300, 600, 700], D), ("FBMP", "torn", [550, 300, 1000, 720], D)], []),
    ("lamp_02", "lamp", 18, "closeup", "Car", "rear", "closeup", ["rear_end"], "moderate",
     [("TLMP", "broken", [280, 330, 650, 720], D), ("RBMP", "scratch", [650, 350, 880, 1000], D)], []),
    ("lamp_03", "lamp", 87, "closeup", "Car", "rear", "closeup", ["rear_end", "parking_scrape"], "minor",
     [("TLMP", "broken", [270, 100, 690, 700], D)], []),
    # ---------------- same-vehicle close-ups (crops of a curated photo; boxes are relative to the crop) ----------------
    ("car_rear_02c", "car-rear", 30, "closeup", "Car", "rear", "closeup", ["rear_end"], "severe",
     [("TLGT", "deformed", [151, 129, 472, 839], D), ("RBMP", "deformed", [623, 32, 887, 871], D), ("TLMP", "broken", [434, 81, 698, 242], D)],
     [[377, 371, 528, 548]]),
    ("car_side_04c", "car-side", 191, "closeup", "Car", "left", "closeup", ["side_swipe"], "severe",
     [("FDOR", "deformed", [77, 83, 923, 500], D), ("RDOR", "dent", [123, 467, 862, 867], D)], []),
    # ---------------- windshields ----------------
    ("cv_03", "windshield", 12, "commercial", "CV", "glass", "front", ["glass", "front_collision"], "moderate",
     [("WSCR", "shattered", [180, 230, 620, 960], D)], []),
    ("glass_04", "windshield", 1, "windshield", "Car", "glass", "closeup", ["glass"], "minor",
     [("WSCR", "crack", [280, 330, 640, 970], D)], []),
    ("glass_05", "windshield", 6, "windshield", "Car", "glass", "closeup", ["glass"], "moderate",
     [("WSCR", "crack", [40, 40, 960, 960], D)], []),
    ("glass_06", "windshield", 14, "windshield", "Car", "glass", "closeup", ["glass"], "moderate",
     [("WSCR", "crack", [0, 300, 950, 1000], D)], []),
    # ---------------- two-wheelers ----------------
    ("tw_01", "two-wheeler", 3, "two-wheeler", "2W", "left", "left", ["skid_fall", "side_swipe", "front_collision"], "moderate",
     [("MIRR", "broken", [460, 90, 600, 230], D), ("SPNL", "scratch", [380, 220, 750, 470], D), ("SLNC", "scratch", [650, 270, 870, 560], D)], []),
    ("tw_02", "two-wheeler", 7, "two-wheeler", "2W", "left", "left", ["skid_fall", "front_collision"], "severe",
     [("FPNL", "broken", [430, 60, 720, 380], D), ("HBAR", "bent", [350, 80, 520, 230], D), ("WRIM", "bent", [700, 270, 850, 490], D)], []),
    ("tw_03", "two-wheeler", 39, "two-wheeler", "2W", "rear", "rear", ["skid_fall", "rear_end", "side_swipe"], "moderate",
     [("TLMP", "broken", [540, 480, 640, 560], D), ("SPNL", "crack", [520, 380, 680, 520], D), ("MIRR", "broken", [430, 600, 520, 680], D)],
     [[580, 540, 730, 610]]),
    ("tw_04", "two-wheeler", 25, "two-wheeler", "2W", "front", "front", ["skid_fall", "front_collision"], "severe",
     [("FPNL", "broken", [410, 300, 680, 650], D), ("FMDG", "broken", [600, 230, 690, 500], D)], [[620, 480, 680, 560]]),
    ("tw_05", "two-wheeler", 83, "two-wheeler", "2W", "front", "left", ["front_collision", "skid_fall"], "severe",
     [("FPNL", "broken", [180, 300, 650, 780], D), ("SPNL", "broken", [430, 0, 700, 420], D), ("WRIM", "bent", [570, 740, 900, 980], D)], []),
    ("tw_06", "two-wheeler", 89, "two-wheeler", "2W", "front", "front", ["front_collision"], "severe",
     [("HLMP", "broken", [200, 400, 340, 530], D), ("FPNL", "broken", [140, 360, 520, 750], D), ("FMDG", "broken", [690, 470, 900, 640], D)], []),
    # ---------------- commercial vehicles ----------------
    ("cv_04", "commercial", 40, "commercial", "CV", "front", "front", ["front_collision", "side_swipe"], "severe",
     [("FPNL", "deformed", [400, 170, 780, 500], D), ("FBMP", "bent", [600, 170, 800, 460], D), ("LBSD", "deformed", [200, 520, 600, 740], D)],
     [[530, 280, 590, 345], [600, 320, 670, 375]]),
    ("cv_05", "commercial", 53, "commercial", "CV", "left", "left", ["side_swipe", "front_collision"], "severe",
     [("LBSD", "deformed", [300, 0, 780, 270], D), ("CDOR", "deformed", [300, 270, 700, 660], D)], []),
    ("cv_06", "commercial", 19, "commercial", "CV", "front", "front", ["front_collision", "pothole"], "severe",
     [("FBMP", "broken", [560, 250, 780, 600], D), ("FPNL", "deformed", [330, 250, 650, 580], D), ("TYRE", "burst", [650, 300, 780, 420], D)],
     [[230, 270, 310, 420]]),
    ("cv_07", "commercial", 20, "commercial", "CV", "glass", "front", ["glass", "front_collision"], "moderate",
     [("WSCR", "shattered", [290, 0, 500, 1000], D), ("HLMP", "crack", [640, 790, 730, 960], D)],
     [[510, 40, 610, 780]]),
    ("cv_08", "commercial", 32, "commercial", "CV", "front", "front", ["front_collision", "flood"], "severe",
     [("FPNL", "crushed", [620, 150, 820, 560], D), ("WSCR", "shattered", [620, 420, 720, 720], D)], []),
    # ---------------- flood ----------------
    ("flood_01", "flood", 50, "flood", "Car", "left", "left", ["flood"], "severe",
     [("FDOR", "submerged", [600, 320, 760, 560], D), ("RDOR", "submerged", [600, 540, 760, 760], D), ("TLGT", "submerged", [620, 740, 750, 880], D)],
     []),
    ("flood_02", "flood", 62, "closeup", "Car", "front", "closeup", ["flood"], "severe",
     [("AIRB", "water damage", [280, 270, 880, 640], D)], []),
    ("flood_03", "flood", 23, "flood", "Car", "rear", "rear", ["flood"], "severe",
     [("RBMP", "submerged", [520, 320, 620, 580], D), ("RDOR", "submerged", [400, 340, 560, 560], D)], []),
    ("cv_09", "flood", 52, "commercial", "CV", "left", "left", ["flood"], "severe",
     [("LBSD", "submerged", [450, 290, 580, 650], D), ("CDOR", "submerged", [360, 280, 520, 480], D)], []),
]


# id → (group, colour, body). Photos in one group show the same vehicle, so a claim can use them together.
# colour feeds the seeded vehicle's colour; body (hatch / sedan / suv / scooter / motorcycle / lcv / truck) steers model matching.
META = {
    "car_front_01": ("rav4", "Blue", "suv"), "glass_01": ("rav4", "Blue", "suv"), "glass_02": ("rav4", "Blue", "suv"),
    "car_front_02": ("bmw3", "Blue", "sedan"), "car_front_03": ("civic", "Silver", "hatch"), "car_front_04": ("amby", "Yellow", "sedan"),
    "car_front_05": ("cu_silver_1", "Silver", "any"), "car_front_06": ("vectra", "Blue", "sedan"), "car_front_07": ("c3", "Red", "hatch"),
    "car_front_08": ("cu_white_1", "Pearl White", "any"), "car_front_09": ("corolla_w", "Pearl White", "sedan"),
    "car_front_10": ("xc90", "Grey", "suv"), "car_front_11": ("alto", "Pearl White", "hatch"), "car_front_12": ("skyline", "Black", "sedan"),
    "car_rear_01": ("mondeo", "Grey", "sedan"), "car_rear_02": ("focus", "Black", "sedan"), "car_rear_03": ("modely", "Blue", "suv"),
    "car_rear_04": ("model3", "Grey", "sedan"),
    "car_side_01": ("bx", "Silver", "hatch"), "car_side_02": ("bx", "Silver", "hatch"), "car_side_03": ("focus_red", "Red", "sedan"),
    "car_side_04": ("passat_blue", "Blue", "sedan"), "car_side_05": ("fiesta_white", "Pearl White", "hatch"),
    "car_side_06": ("cu_blue_glass", "Blue", "any"), "glass_03": ("hail_black", "Black", "any"), "car_rear_07": ("cu_silver_rust", "Silver", "any"),
    "car_front_13": ("elantra", "Silver", "sedan"), "car_front_14": ("rollover_blue", "Blue", "hatch"),
    "lamp_01": ("cu_green_1", "Green", "any"), "lamp_02": ("cu_blue_2", "Blue", "any"), "lamp_03": ("cu_blue_3", "Blue", "any"),
    "car_rear_02c": ("focus", "Black", "sedan"), "car_side_04c": ("passat_blue", "Blue", "sedan"),
    "cv_03": ("van_white_2", "Pearl White", "lcv"), "glass_04": ("glass_dark", "Black", "any"),
    "glass_05": ("glass_star", None, "any"), "glass_06": ("glass_highway", None, "any"),
    "tw_01": ("tw_cruiser", "Black", "motorcycle"), "tw_02": ("tw_sport_black", "Black", "motorcycle"),
    "tw_03": ("tw_silver", "Silver", "motorcycle"), "tw_04": ("tw_yellow", "Yellow", "motorcycle"),
    "tw_05": ("tw_scooter_black", "Black", "scooter"), "tw_06": ("tw_scooter_tree", "Black", "scooter"),
    "cv_04": ("truck_blue_in", "Blue", "truck"), "cv_05": ("truck_tata", "Pearl White", "truck"), "cv_06": ("truck_blue_uk", "Blue", "truck"),
    "cv_07": ("truck_white_cab", "Pearl White", "truck"), "cv_08": ("pickup_tree", "Pearl White", "lcv"),
    "flood_01": ("flood_silver", "Silver", "hatch"), "flood_02": ("flood_silver", "Silver", "hatch"),
    "flood_03": ("flood_red", "Red", "hatch"), "cv_09": ("flood_pickup", "Pearl White", "lcv"),
    "scratch_01": ("cu_black_1", "Black", "any"), "scratch_02": ("keyed_silver", "Silver", "sedan"),
    "cv_01": ("van_white", "Pearl White", "lcv"), "cv_02": ("van_silver", "Silver", "lcv"), "car_rear_05": ("cu_silver_2", "Silver", "any"), "car_rear_06": ("cu_grey_1", "Grey", "any"),
}

# id → crop box_2d (normalised, on the original image)
CROPS = {"car_rear_02c": [250, 80, 780, 700], "car_side_04c": [200, 100, 850, 700]}


# ------------------------------------------------------------------------------------------------
# Build the manifest
# ------------------------------------------------------------------------------------------------

def build_manifest() -> dict:
    """Resolve each pick against its discovery record and write stock_photo_manifest.json (preserving build output)."""
    import json
    import sys
    from pathlib import Path

    server = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(server))
    from app.services.json_store import read_json_sync, write_json_sync
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import reference_data as R

    previous = {p["id"]: p for p in (read_json_sync("stock_photo_manifest.json", {}) or {}).get("photos", [])}
    cands: dict[str, dict[int, dict]] = {}
    photos = []
    for pid, ccat, n, cat, vtype, zone, view, incidents, severity, boxes, plates in PICKS:
        if ccat not in cands:
            path = server / ".cache" / "stock" / "candidates" / ccat / "candidates.json"
            cands[ccat] = {r["n"]: r for r in json.loads(path.read_text(encoding="utf-8"))}
        c = cands[ccat][n]
        parts = R.PARTS_BY_TYPE[vtype]
        entry = {
            "id": pid, "category": cat, "source": c["source"], "ref": c["ref"], "vehicle_type": vtype, "zone": zone, "view": view,
            "incidents": incidents, "severity": severity, "plates": plates,
            "group": META.get(pid, (pid,))[0], **({"crop": CROPS[pid]} if pid in CROPS else {}), "colour": (META.get(pid) or (None, None))[1], "body": (META.get(pid) or (None, None, "any"))[2],
            "boxes": [{"part": code, "damage_type": dmg, "box_2d": box, "kind": "pre_existing" if kind == P else "damage",
                       "label": f"{parts[code][0]} · {dmg}"} for code, dmg, box, kind in boxes],
        }
        if pid in previous:  # keep fields written by `fetch_stock_images.py build` (url, thumb, blur, credit…)
            entry |= {k: v for k, v in previous[pid].items() if k not in entry}
        photos.append(entry)
    manifest = {"about": "Curated stock photos with hand-placed damage boxes (box_2d = [ymin, xmin, ymax, xmax], 0–1000). "
                         "Edit server/scripts/stock_curation.py, then run it and `fetch_stock_images.py build`.",
                "photos": photos}
    write_json_sync("stock_photo_manifest.json", manifest)
    return manifest


if __name__ == "__main__":
    m = build_manifest()
    print(f"stock_photo_manifest.json: {len(m['photos'])} photos")
