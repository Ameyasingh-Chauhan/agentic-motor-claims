"""Apply seed.SCENARIO_PLACES to an existing claims.json without re-seeding (idempotent).

    python scripts/fix_scenario_locations.py

Older seeds put the demo scenarios' incident pins (and photo EXIF) at city coordinates instead of the named place (e.g. "Mumbai–Pune
Expressway near Khalapur" sat in central Mumbai), which hid the fastag_mismatch distance contradiction. This moves each scenario's
incident location, and its photos' EXIF GPS (except fastag_mismatch, whose photos were taken in Mumbai by design), to the place.
"""
from __future__ import annotations

import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))
from app.services.json_store import read_json_sync, write_json_sync  # noqa: E402

PLACES = {   # keep in sync with seed.SCENARIO_PLACES
    "clean_rear_end": (18.3606, 73.8516),
    "fastag_mismatch": (18.8305, 73.2797),
    "garage_overquote": (10.0271, 76.3083),
    "theft_two_wheeler": (18.6298, 73.7997),
}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    claims = read_json_sync("claims.json", [])
    changed = 0
    for c in claims:
        place = PLACES.get(c.get("scenario_id"))
        if not place:
            continue
        lat, lng = place
        loc = c["incident"]["location"]
        if (loc["lat"], loc["lng"]) != (lat, lng):
            loc["lat"], loc["lng"] = lat, lng
            changed += 1
        if c["scenario_id"] != "fastag_mismatch":
            for i, m in enumerate(c["media"]):
                if m.get("exif") and m["exif"].get("lat") is not None:
                    m["exif"]["lat"], m["exif"]["lng"] = round(lat + 0.0007 * (i + 1), 4), round(lng - 0.0005 * (i + 1), 4)
        print(f"  {c['scenario_id']:<18} {c['id']}  → {lat}, {lng}")
    write_json_sync("claims.json", claims)
    print(f"Updated {changed} scenario location(s).")


if __name__ == "__main__":
    main()
