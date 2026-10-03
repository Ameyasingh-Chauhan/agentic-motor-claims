"""Build the user-provided claim photos (spec §18) into client/public/assets/stock/.

    python scripts/stock_curation.py                      # catalogue → server/data/stock_photo_manifest.json
    python scripts/build_stock_photos.py [--prune-legacy]

Reads each catalogued photo from server/assets_src/photos/, applies its optional crop, blurs number plates and writes
WebP (longest side ≤ 1600 px, never upscaled) + 320 px thumbnail + tiny base64 blur placeholder. Output goes to a temp
folder that is swapped in file by file only when complete (scripts/fs_sync.py). CREDITS.json credits every image as
"Provided by user". Final dimensions, URLs and the blur placeholder are written back into the manifest, so the seed needs
no image I/O. `--prune-legacy` drops the old neutral fallback-* placeholders (only once the seed no longer uses them).

(`fetch_stock_images.py` — the earlier Commons/Openverse discovery tool — is kept in the repo but no longer used.)
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

SERVER = Path(__file__).resolve().parents[1]
ROOT = SERVER.parent
sys.path.insert(0, str(SERVER))
from app.services.json_store import read_json_sync, write_json_sync  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fs_sync import sync_dir  # noqa: E402

SRC = SERVER / "assets_src" / "photos"
OUT = ROOT / "client" / "public" / "assets" / "stock"
MANIFEST = "stock_photo_manifest.json"
MAX_SIDE, THUMB_W, BLUR_W = 1600, 320, 16
CREDIT = {"author": "Provided by user", "source": "user", "source_url": None, "licence": "Provided by user", "licence_url": None}


def to_px(box: list[float], w: int, h: int) -> tuple[int, int, int, int]:
    """box_2d [ymin, xmin, ymax, xmax] normalised 0–1000 → pixel (left, top, right, bottom)."""
    y0, x0, y1, x1 = box
    return int(x0 / 1000 * w), int(y0 / 1000 * h), int(x1 / 1000 * w), int(y1 / 1000 * h)


def blur_regions(im: Image.Image, boxes: list[list[float]]) -> Image.Image:
    """Pixelate + blur each plate box so the characters cannot be read at any zoom."""
    im = im.copy()
    for box in boxes:
        l, t, r, b = to_px(box, *im.size)
        if r - l < 2 or b - t < 2:
            continue
        region = im.crop((l, t, r, b))
        small = region.resize((max(1, region.width // 10), max(1, region.height // 6)), Image.Resampling.BILINEAR)
        region = small.resize(region.size, Image.Resampling.NEAREST).filter(ImageFilter.GaussianBlur(max(2, region.height // 5)))
        im.paste(region, (l, t))
    return im


def load(entry: dict) -> Image.Image:
    im = ImageOps.exif_transpose(Image.open(SRC / entry["file"])).convert("RGB")
    if entry.get("crop"):  # manifest boxes are already relative to the crop (stock_curation.crop_box)
        im = im.crop(to_px(entry["crop"], *im.size))
    return im


def build(prune_legacy: bool = False) -> None:
    manifest = read_json_sync(MANIFEST)
    if not manifest or not manifest.get("photos"):
        sys.exit(f"{MANIFEST} has no catalogued photos - run `python scripts/stock_curation.py` first.")
    tmp = OUT.with_name("stock.__building__")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    if not prune_legacy and OUT.exists():  # keep the Phase 3A neutral fallbacks until the seed no longer references them
        for f in OUT.glob("*/fallback*"):
            (tmp / f.parent.name).mkdir(exist_ok=True)
            shutil.copy2(f, tmp / f.parent.name / f.name)
    credits = []
    for entry in manifest["photos"]:
        im = blur_regions(load(entry), entry.get("plates", []))
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)  # shrinks only; small photos keep their native size
        folder = tmp / entry["category"]
        folder.mkdir(exist_ok=True)
        name = entry["id"]
        im.save(folder / f"{name}.webp", "WEBP", quality=82, method=6)  # saving without exif strips any GPS metadata
        thumb = im.copy()
        thumb.thumbnail((THUMB_W, THUMB_W * 2), Image.Resampling.LANCZOS)
        thumb.save(folder / f"{name}-thumb.webp", "WEBP", quality=76, method=6)
        tiny = im.copy()
        tiny.thumbnail((BLUR_W, BLUR_W), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        tiny.filter(ImageFilter.GaussianBlur(1)).save(buf, "WEBP", quality=50)
        base = f"/assets/stock/{entry['category']}/{name}"
        credits.append({"id": name, "file": f"{base}.webp", "thumb": f"{base}-thumb.webp", "width": im.width, "height": im.height,
                        "blur_data": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(),
                        "title": entry["file"], **CREDIT,
                        "modified": ("Cropped, " if entry.get("crop") else "") + "resized, number plates blurred"})
        print(f"  ✓ {name:<18} {im.width}×{im.height}")
    (tmp / "CREDITS.json").write_text(json.dumps({"generated_by": "server/scripts/build_stock_photos.py", "images": credits},
                                                 indent=2, ensure_ascii=False), encoding="utf-8")
    sync_dir(tmp, OUT)
    by_id = {c["id"]: c for c in credits}
    for entry in manifest["photos"]:
        c = by_id[entry["id"]]
        entry.update({"available": True, "url": c["file"], "thumb": c["thumb"], "width": c["width"], "height": c["height"],
                      "blur_data": c["blur_data"], "credit": dict(CREDIT)})
    write_json_sync(MANIFEST, manifest)
    print(f"Built {len(credits)} images into {OUT}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prune-legacy", action="store_true", help="drop the old neutral fallback-* placeholders")
    build(ap.parse_args().prune_legacy)
