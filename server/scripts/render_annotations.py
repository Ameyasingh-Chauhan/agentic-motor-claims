"""Draw annotation boxes onto stock photos as contact sheets, to verify by eye that every box sits on damage.

    python scripts/render_annotations.py manifest [--ids a,b,c]     # boxes + plate boxes from stock_photo_manifest.json
    python scripts/render_annotations.py claims <claim_id> [...]     # the boxes a seeded claim actually carries
    python scripts/render_annotations.py scenarios                   # all five demo scenarios
    python scripts/render_annotations.py grid <photo_id>             # 0–1000 grid on a SOURCE photo, for placing boxes

Sheets are written to server/.cache/stock/review/. Colours follow the Damage tab: green = fresh damage,
red = pre-existing, amber = low confidence / overquoted; plate boxes are drawn dashed grey.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SERVER = Path(__file__).resolve().parents[1]
ROOT = SERVER.parent
sys.path.insert(0, str(SERVER))
from app.services.json_store import read_json_sync  # noqa: E402

PUBLIC = ROOT / "client" / "public"
OUT = SERVER / ".cache" / "stock" / "review"
FONT = Path(__file__).resolve().parent / "assets" / "fonts" / "inter-latin-wght-normal.woff2"
TONES = {"pass": (22, 163, 74), "fail": (220, 38, 38), "warn": (217, 119, 6), "plate": (160, 160, 160)}


def font(size: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_axes([650])
    return f


def draw_boxes(im: Image.Image, boxes: list[dict]) -> Image.Image:
    im = im.convert("RGB").copy()
    d = ImageDraw.Draw(im)
    w, h = im.size
    stroke = max(3, w // 260)
    f = font(max(14, w // 50))
    for b in boxes:
        y0, x0, y1, x1 = b["box_2d"]
        rect = (x0 / 1000 * w, y0 / 1000 * h, x1 / 1000 * w, y1 / 1000 * h)
        colour = TONES[b.get("tone", "pass")]
        if b.get("tone") == "plate":
            for i in range(int(rect[0]), int(rect[2]), 12):
                d.line((i, rect[1], min(i + 6, rect[2]), rect[1]), fill=colour, width=stroke)
                d.line((i, rect[3], min(i + 6, rect[2]), rect[3]), fill=colour, width=stroke)
            continue
        d.rectangle(rect, outline=colour, width=stroke)
        label = b.get("label", "")
        if label:
            tw = d.textlength(label, font=f)
            ty = rect[1] - f.size - 10 if rect[1] > f.size + 12 else rect[3] + 2
            d.rectangle((rect[0], ty, rect[0] + tw + 12, ty + f.size + 8), fill=colour)
            d.text((rect[0] + 6, ty + 3), label, font=f, fill=(255, 255, 255))
    return im


def sheet(tiles: list[tuple[str, Image.Image]], path: Path, cell: int = 520, cols: int = 3) -> None:
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new("RGB", (cols * cell, rows * (cell + 34)), (24, 24, 24))
    d = ImageDraw.Draw(out)
    for i, (caption, im) in enumerate(tiles):
        x, y = (i % cols) * cell, (i // cols) * (cell + 34)
        im = im.copy()
        im.thumbnail((cell - 8, cell - 8))
        out.paste(im, (x + (cell - im.width) // 2, y + 34 + (cell - im.height) // 2))
        d.text((x + 8, y + 8), caption[:60], font=font(18), fill=(240, 240, 240))
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, quality=85)
    print(f"  {path}")


def load(url: str) -> Image.Image:
    return Image.open(PUBLIC / url.lstrip("/"))


def manifest_tiles(ids: set[str] | None) -> list[tuple[str, Image.Image]]:
    tiles = []
    for p in read_json_sync("stock_photo_manifest.json", {}).get("photos", []):
        if (ids and p["id"] not in ids) or not p.get("url"):
            continue
        boxes = [{"box_2d": b["box_2d"], "label": b["label"], "tone": "fail" if b.get("kind") == "pre_existing" else "pass"} for b in p.get("boxes", [])]
        # Plates are already blurred in the processed image; show where they were.
        boxes += [{"box_2d": pl, "tone": "plate"} for pl in p.get("plates", [])]
        tiles.append((f"{p['id']} · {p.get('zone', '')}", draw_boxes(load(p["url"]), boxes)))
    return tiles


def claim_tiles(claim_ids: list[str]) -> list[tuple[str, Image.Image]]:
    claims = {c["id"]: c for c in read_json_sync("claims.json", [])}
    by_scenario = {c.get("scenario_id"): c for c in claims.values() if c.get("scenario_id")}
    tiles = []
    for cid in claim_ids:
        c = claims.get(cid) or by_scenario.get(cid)
        if not c:
            print(f"  unknown claim {cid}")
            continue
        for m in [m for m in c["media"] if m["kind"] == "photo"]:
            boxes = []
            for item in c["damage"]["items"]:
                tone = "fail" if not item.get("fresh", True) else ("warn" if item.get("flag") == "warn" or item["confidence"] < 0.75 else "pass")
                boxes += [{"box_2d": b["box_2d"], "label": b["label"], "tone": tone} for b in item.get("boxes", []) if b["photo_id"] == m["id"]]
            for pe in c["damage"].get("pre_existing", []):
                boxes += [{"box_2d": b["box_2d"], "label": b["label"], "tone": "fail"} for b in pe.get("boxes", []) if b["photo_id"] == m["id"]]
            tiles.append((f"{c.get('scenario_id') or c['id']} · {m['id']} · {m.get('slot')}", draw_boxes(load(m["url"]), boxes)))
    return tiles


def grid(photo_id: str) -> Path:
    """Draw the box_2d coordinate grid (0–1000, lines every 50) on a source photo in server/assets_src/photos/."""
    from PIL import ImageOps
    src = next((f for f in (SERVER / "assets_src" / "photos").iterdir() if f.stem == photo_id), None)
    if src is None:
        sys.exit(f"no source photo named {photo_id}.* in server/assets_src/photos/")
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    im.thumbnail((1400, 1400))
    d = ImageDraw.Draw(im)
    w, h = im.size
    f = font(max(12, w // 80))
    for v in range(0, 1001, 50):
        colour = (255, 40, 40) if v % 100 == 0 else (255, 200, 0)
        d.line((v / 1000 * w, 0, v / 1000 * w, h), fill=colour, width=1)
        d.line((0, v / 1000 * h, w, v / 1000 * h), fill=colour, width=1)
        if v % 100 == 0:
            d.text((v / 1000 * w + 3, 2), str(v), font=f, fill=(255, 255, 0))      # x (columns) along the top
            d.text((3, v / 1000 * h + 2), str(v), font=f, fill=(255, 255, 0))      # y (rows) down the left
    path = OUT / f"grid_{photo_id}.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, quality=88)
    print(f"  {path}  (source {src.name})")
    return path


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("manifest")
    m.add_argument("--ids")
    c = sub.add_parser("claims")
    c.add_argument("ids", nargs="+")
    sub.add_parser("scenarios")
    g = sub.add_parser("grid")
    g.add_argument("photo_id")
    args = ap.parse_args()
    if args.cmd == "grid":
        grid(args.photo_id)
        return
    if args.cmd == "manifest":
        tiles = manifest_tiles(set(args.ids.split(",")) if args.ids else None)
        name = "manifest"
    elif args.cmd == "claims":
        tiles, name = claim_tiles(args.ids), "claims"
    else:
        tiles = claim_tiles(["clean_rear_end", "fastag_mismatch", "garage_overquote", "theft_two_wheeler", "flood_total_loss"])
        name = "scenarios"
    for i in range(0, len(tiles), 9):
        sheet(tiles[i:i + 9], OUT / f"{name}_{i // 9 + 1:02d}.jpg")
    print(f"{len(tiles)} annotated photos")


if __name__ == "__main__":
    main()
