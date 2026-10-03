"""Royalty-free stock photos for seeded claims (spec §18).

Two commands:

  python scripts/fetch_stock_images.py discover <category> [--source commons|openverse|pexels] [--query "..."]
      Searches the sources for a category, keeps only free-reuse licences (CC0, PDM, CC BY, CC BY-SA — never NC/ND),
      downloads small previews into server/.cache/stock/candidates/<category>/ and composes numbered contact sheets
      (sheet_01.jpg …) plus candidates.json, for human curation.

  python scripts/fetch_stock_images.py build
      Reads the curated selection in server/data/stock_photo_manifest.json, downloads each original (cached in
      server/.cache/stock/originals/), re-verifies its licence from the source's own metadata, blurs number plates,
      and writes WebP (max 1600 px) + 320 px thumbnail + tiny base64 blur placeholder into
      client/public/assets/stock/. Output goes to a temp folder that replaces the old one only when complete, and
      CREDITS.json records source URL, author and licence for every image.

Sources are pluggable (`SOURCES`). Pexels is used only when PEXELS_API_KEY is set in server/.env or the environment;
the key is never printed or logged.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import io
import json
import os
import re
import shutil
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

SERVER = Path(__file__).resolve().parents[1]
ROOT = SERVER.parent
sys.path.insert(0, str(SERVER))
from app.services.json_store import read_json_sync, write_json_sync  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fs_sync import sync_dir  # noqa: E402

CACHE = SERVER / ".cache" / "stock"
OUT = ROOT / "client" / "public" / "assets" / "stock"
MANIFEST = "stock_photo_manifest.json"
UA = {"User-Agent": "AgenticMotorClaimsDemo/0.1 (internal insurance demo; contact: demo@automationedge.example) python-httpx"}

MAX_SIDE, THUMB_W, BLUR_W = 1600, 320, 16

# Search plan per category. Close-up categories lean on Openverse (Flickr), whole-vehicle ones on Commons.
CATEGORIES: dict[str, dict[str, list[str]]] = {
    "car-front": {"commons": ["damaged car front bumper", "car accident front damage", "Alto accident", "crashed car front India"],
                  "openverse": ["car front damage", "smashed front bumper"]},
    "car-rear": {"commons": ["car rear damage accident", "rear-end collision car", "damaged rear bumper"],
                 "openverse": ["rear bumper damage", "rear end collision car"]},
    "car-side": {"commons": ["car door dent", "car side damage accident", "side collision car"],
                 "openverse": ["car door dent", "dented car door", "car side damage"]},
    "scratch": {"commons": ["car paint scratch", "scratched car"], "openverse": ["car scratch", "scratched car paint", "keyed car"]},
    "lamp": {"commons": ["broken headlight car", "broken tail light"], "openverse": ["broken headlight", "broken tail light", "smashed taillight"]},
    "windshield": {"commons": ["cracked windshield", "broken windscreen"], "openverse": ["cracked windshield", "broken windshield"]},
    "two-wheeler": {"commons": ["damaged motorcycle", "motorcycle accident", "damaged scooter", "crashed scooter"],
                    "openverse": ["crashed motorcycle", "damaged scooter", "motorbike accident"]},
    "commercial": {"commons": ["damaged truck", "truck accident India", "damaged lorry", "damaged van accident"],
                   "openverse": ["damaged truck", "truck crash", "damaged delivery van"]},
    "flood": {"commons": ["flooded car", "cars submerged flood", "car in flood water India"],
              "openverse": ["flooded car", "car submerged flood"]},
    "clean": {"commons": ["Hyundai Creta", "Maruti Suzuki Swift", "Maruti Suzuki Baleno", "Honda Activa", "Tata Ace",
                          "Tata Nexon", "Hero Splendor", "Mahindra Bolero Pik-Up"]},
}

ACCEPTED = {"cc0", "pdm", "by", "by-sa"}


# ------------------------------------------------------------------------------------------------
# Licences
# ------------------------------------------------------------------------------------------------

def normalise_licence(raw: str) -> str | None:
    """Map a source's licence string to cc0 / pdm / by / by-sa; None for anything else (NC, ND, GFDL-only, unknown)."""
    s = (raw or "").strip().lower().replace("_", "-").replace(" ", "-")
    if not s:
        return None
    if "nc" in s.split("-") or "-nc" in s or "nd" in s.split("-") or "-nd" in s:
        return None
    if s.startswith("cc0") or s == "cc-zero" or "publicdomain/zero" in s:
        return "cc0"
    if s in ("pd", "pdm", "public-domain", "public-domain-mark") or s.startswith("pd-") or "publicdomain/mark" in s:
        return "pdm"
    if re.match(r"^(cc-)?by-sa(-|$)", s) or "licenses/by-sa/" in s:
        return "by-sa"
    if re.match(r"^(cc-)?by(-\d|$)", s) or "licenses/by/" in s:
        return "by"
    return None


LICENCE_LABEL = {"cc0": "CC0 1.0", "pdm": "Public Domain", "by": "CC BY", "by-sa": "CC BY-SA", "pexels": "Pexels License"}
LICENCE_URL = {"cc0": "https://creativecommons.org/publicdomain/zero/1.0/", "pdm": "https://creativecommons.org/publicdomain/mark/1.0/",
               "by": "https://creativecommons.org/licenses/by/{v}/", "by-sa": "https://creativecommons.org/licenses/by-sa/{v}/",
               "pexels": "https://www.pexels.com/license/"}


def strip_html(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


# ------------------------------------------------------------------------------------------------
# HTTP with throttling and 429 back-off
# ------------------------------------------------------------------------------------------------

class Http:
    def __init__(self) -> None:
        self.client = httpx.Client(headers=UA, timeout=40, follow_redirects=True)
        self.last: dict[str, float] = {}

    def get(self, url: str, *, params=None, headers=None, min_gap: float = 0.0, host: str = "", tries: int = 5) -> httpx.Response:
        for attempt in range(tries):
            if min_gap:
                wait = self.last.get(host, 0) + min_gap - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
            self.last[host] = time.monotonic()
            try:
                r = self.client.get(url, params=params, headers=headers)
            except httpx.TransportError as e:  # DNS hiccups / resets on this network are transient
                if attempt == tries - 1:
                    raise
                print(f"  {type(e).__name__} for {host or url[:40]} - retrying in {5 * (attempt + 1)}s")
                time.sleep(5 * (attempt + 1))
                continue
            if r.status_code == 429 or r.status_code >= 500:
                retry = r.headers.get("Retry-After")
                delay = float(retry) if retry and retry.isdigit() else min(120, 10 * 2 ** attempt)
                if r.status_code != 429 and host.endswith("-img"):  # dead image origins: fail fast, don't stall discovery
                    delay = 2
                print(f"  {r.status_code} from {host or url[:40]} - backing off {delay:.0f}s")
                time.sleep(delay)
                continue
            return r
        r.raise_for_status()
        return r


# ------------------------------------------------------------------------------------------------
# Sources
# ------------------------------------------------------------------------------------------------

@dataclass
class Candidate:
    source: str
    ref: str                 # Commons file title / Openverse id / Pexels id
    title: str
    preview_url: str
    original_url: str
    width: int
    height: int
    licence: str             # normalised: cc0 / pdm / by / by-sa / pexels
    licence_version: str
    author: str
    source_page: str
    extra: dict = field(default_factory=dict)


class Commons:
    name = "commons"
    API = "https://commons.wikimedia.org/w/api.php"

    def __init__(self, http: Http):
        self.http = http

    def _pages_to_candidates(self, pages: dict) -> list[Candidate]:
        out = []
        for p in pages.values():
            info = (p.get("imageinfo") or [None])[0]
            if not info or info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
                continue
            meta = info.get("extmetadata", {})
            raw = meta.get("License", {}).get("value") or meta.get("LicenseShortName", {}).get("value", "")
            lic = normalise_licence(raw)
            if lic is None:
                continue
            version = (re.search(r"(\d\.\d)", raw) or [None, ""])[1]
            out.append(Candidate(
                source=self.name, ref=p["title"], title=p["title"].removeprefix("File:"), preview_url=info.get("thumburl", info["url"]),
                original_url=info["url"], width=info["width"], height=info["height"], licence=lic, licence_version=version,
                author=strip_html(meta.get("Artist", {}).get("value", "")) or "Unknown", source_page=info["descriptionurl"],
            ))
        return out

    def search(self, query: str, limit: int = 40) -> list[Candidate]:
        r = self.http.get(self.API, host="commons", min_gap=0.5, params={
            "action": "query", "format": "json", "generator": "search", "gsrsearch": f"{query} filetype:bitmap",
            "gsrnamespace": 6, "gsrlimit": limit, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 400})
        return self._pages_to_candidates(r.json().get("query", {}).get("pages", {}))

    def lookup(self, ref: str, width: int | None = None) -> Candidate | None:
        params = {"action": "query", "format": "json", "titles": ref, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata"}
        if width:
            params["iiurlwidth"] = width
        r = self.http.get(self.API, host="commons", min_gap=0.5, params=params)
        found = self._pages_to_candidates(r.json().get("query", {}).get("pages", {}))
        return found[0] if found else None


class Openverse:
    """Anonymous Openverse API. Anonymous limits are small, so requests are spaced ≥ 4 s and 429s back off."""
    name = "openverse"
    API = "https://api.openverse.org/v1/images/"
    GAP = 4.0

    def __init__(self, http: Http):
        self.http = http

    def _candidate(self, x: dict) -> Candidate | None:
        lic = normalise_licence(x.get("license", ""))
        if lic is None:
            return None
        return Candidate(
            source=self.name, ref=x["id"], title=x.get("title") or "Untitled", preview_url=x["url"], original_url=x["url"],
            width=x.get("width") or 0, height=x.get("height") or 0, licence=lic, licence_version=x.get("license_version") or "",
            author=x.get("creator") or "Unknown", source_page=x.get("foreign_landing_url") or x.get("url"),
            extra={"provider": x.get("provider"), "openverse_url": f"https://openverse.org/image/{x['id']}"},
        )

    def search(self, query: str, limit: int = 40) -> list[Candidate]:
        r = self.http.get(self.API, host="openverse", min_gap=self.GAP, params={
            "q": query, "license": "cc0,pdm,by,by-sa", "page_size": min(limit, 20), "mature": "false", "extension": "jpg,png"})
        if r.status_code != 200:
            print(f"  openverse search failed: {r.status_code}")
            return []
        return [c for c in (self._candidate(x) for x in r.json().get("results", [])) if c]

    def lookup(self, ref: str, width: int | None = None) -> Candidate | None:
        r = self.http.get(f"{self.API}{ref}/", host="openverse", min_gap=self.GAP)
        return self._candidate(r.json()) if r.status_code == 200 else None

    def confirm_original(self, c: Candidate) -> tuple[bool, str]:
        """Check the licence on the original (e.g. Flickr) page. Returns (ok, how_verified)."""
        try:
            r = self.http.get(c.source_page, host="origin", min_gap=1.0, tries=2)
        except httpx.HTTPError:
            return True, "openverse metadata (original page unreachable)"
        if r.status_code != 200:
            return True, f"openverse metadata (original page HTTP {r.status_code})"
        links = set(re.findall(r"creativecommons\.org/(?:licenses|publicdomain)/([a-z\-]+)/", r.text))
        if not links:
            return True, "openverse metadata (no licence link on original page)"
        page = {normalise_licence(l if l not in ("zero", "mark") else ("cc0" if l == "zero" else "pdm")) for l in links}
        page.discard(None)
        if c.licence in page:
            return True, "original page"
        return False, f"original page shows {sorted(links)}"


class Pexels:
    name = "pexels"
    API = "https://api.pexels.com/v1/"

    def __init__(self, http: Http, key: str):
        self.http, self._key = http, key

    def _candidate(self, x: dict) -> Candidate:
        return Candidate(
            source=self.name, ref=str(x["id"]), title=x.get("alt") or f"Pexels {x['id']}", preview_url=x["src"]["medium"],
            original_url=x["src"]["large2x"], width=x["width"], height=x["height"], licence="pexels", licence_version="",
            author=x.get("photographer") or "Unknown", source_page=x["url"])

    def search(self, query: str, limit: int = 40) -> list[Candidate]:
        r = self.http.get(self.API + "search", host="pexels", min_gap=1.0, params={"query": query, "per_page": min(limit, 40)},
                          headers={"Authorization": self._key})
        return [self._candidate(x) for x in r.json().get("photos", [])] if r.status_code == 200 else []

    def lookup(self, ref: str, width: int | None = None) -> Candidate | None:
        r = self.http.get(self.API + f"photos/{ref}", host="pexels", min_gap=1.0, headers={"Authorization": self._key})
        return self._candidate(r.json()) if r.status_code == 200 else None


def pexels_key() -> str | None:
    if os.environ.get("PEXELS_API_KEY"):
        return os.environ["PEXELS_API_KEY"]
    env = SERVER / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("PEXELS_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


def sources(http: Http) -> dict[str, object]:
    out: dict[str, object] = {"commons": Commons(http), "openverse": Openverse(http)}
    key = pexels_key()
    if key:
        out["pexels"] = Pexels(http, key)
    return out


# ------------------------------------------------------------------------------------------------
# Discover → contact sheets
# ------------------------------------------------------------------------------------------------

def font(size: int) -> ImageFont.ImageFont:
    return ImageFont.load_default(size=size)


def contact_sheet(images: list[tuple[int, Image.Image]], path: Path, cell: int = 300, cols: int = 4) -> None:
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    for i, (num, im) in enumerate(images):
        x, y = (i % cols) * cell, (i // cols) * cell
        tile = ImageOps.contain(im.convert("RGB"), (cell - 8, cell - 8))
        sheet.paste(tile, (x + (cell - tile.width) // 2, y + (cell - tile.height) // 2))
        d.rectangle((x + 4, y + 4, x + 54, y + 34), fill=(249, 115, 22))
        d.text((x + 10, y + 6), str(num), fill=(0, 0, 0), font=font(24))
    sheet.save(path, quality=82)


def discover(category: str, only: str | None, extra_queries: list[str]) -> None:
    http = Http()
    srcs = sources(http)
    plan = {k: list(v) for k, v in CATEGORIES[category].items()}
    if extra_queries:
        plan = {only or "commons": extra_queries}
    folder = CACHE / "candidates" / category
    folder.mkdir(parents=True, exist_ok=True)
    index_path = folder / "candidates.json"
    index: list[dict] = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
    seen = {(c["source"], c["ref"]) for c in index}
    new: list[Candidate] = []
    for src_name, queries in plan.items():
        if only and src_name != only or src_name not in srcs:
            continue
        for q in queries:
            try:
                found = srcs[src_name].search(q)
            except httpx.HTTPError as e:
                print(f"  {src_name}: '{q}' failed ({type(e).__name__}) - skipped")
                continue
            print(f"  {src_name}: '{q}' → {len(found)} free-licence results")
            for c in found:
                if (c.source, c.ref) not in seen and min(c.width, c.height) >= 400:
                    seen.add((c.source, c.ref))
                    new.append(c)
    start = len(index) + 1
    previews: list[tuple[int, Image.Image]] = []
    for n, c in enumerate(new, start):
        try:
            r = http.get(c.preview_url, host=c.source + "-img", min_gap=0.3, tries=2)
            r.raise_for_status()
            im = Image.open(io.BytesIO(r.content))
            im.load()
        except Exception as e:  # noqa: BLE001 - skip unreadable previews
            print(f"  skip preview {c.ref}: {type(e).__name__}")
            continue
        index.append({"n": n, **asdict(c)})
        previews.append((n, im))
    index_path.write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    for i in range(0, len(previews), 16):
        nums = previews[i:i + 16]
        contact_sheet(nums, folder / f"sheet_{nums[0][0]:03d}-{nums[-1][0]:03d}.jpg")
    print(f"{category}: {len(previews)} new candidates ({len(index)} total) in {folder}")


# ------------------------------------------------------------------------------------------------
# Build from the curated manifest
# ------------------------------------------------------------------------------------------------

def to_px(box: list[float], w: int, h: int) -> tuple[int, int, int, int]:
    """box_2d [ymin, xmin, ymax, xmax] normalised 0–1000 → pixel (left, top, right, bottom)."""
    y0, x0, y1, x1 = box
    return int(x0 / 1000 * w), int(y0 / 1000 * h), int(x1 / 1000 * w), int(y1 / 1000 * h)


def blur_regions(im: Image.Image, boxes: list[list[float]]) -> Image.Image:
    im = im.copy()
    for box in boxes:
        l, t, r, b = to_px(box, *im.size)
        region = im.crop((l, t, r, b))
        small = region.resize((max(1, region.width // 12), max(1, region.height // 12)), Image.Resampling.BILINEAR)
        region = small.resize(region.size, Image.Resampling.NEAREST).filter(ImageFilter.GaussianBlur(max(2, region.height // 6)))
        im.paste(region, (l, t))
    return im


def original_bytes(http: Http, entry: dict, cand: Candidate) -> bytes:
    key = hashlib.sha1(f"{entry['source']}:{entry['ref']}".encode()).hexdigest()[:16]
    path = CACHE / "originals" / f"{key}.bin"
    if path.exists():
        return path.read_bytes()
    url = cand.original_url
    if entry["source"] == "commons" and max(cand.width, cand.height) > 2400:
        scaled = sources(http)["commons"].lookup(entry["ref"], width=2000)  # type: ignore[attr-defined]
        url = scaled.preview_url if scaled else url
    data = http.get(url, host=entry["source"] + "-img", min_gap=0.5).content
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def build(prune_legacy: bool = False) -> None:
    manifest = read_json_sync(MANIFEST)
    if not manifest or not manifest.get("photos"):
        sys.exit(f"{MANIFEST} has no curated photos yet - run `discover` and curate first.")
    http = Http()
    srcs = sources(http)
    tmp = OUT.with_name("stock.__building__")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    if not prune_legacy and OUT.exists():  # keep the Phase 3A neutral fallbacks until the seed no longer references them
        for f in OUT.glob("*/fallback*"):
            (tmp / f.parent.name).mkdir(exist_ok=True)
            shutil.copy2(f, tmp / f.parent.name / f.name)
    credits, rejected = [], []
    for entry in manifest["photos"]:
        src = srcs.get(entry["source"])
        if src is None:
            rejected.append((entry["id"], f"source {entry['source']} unavailable"))
            continue
        cand = src.lookup(entry["ref"])  # licence re-verified from the source's own metadata
        if cand is None:
            rejected.append((entry["id"], "not found or licence no longer free-reuse"))
            continue
        how = "source metadata"
        if isinstance(src, Openverse):
            ok, how = src.confirm_original(cand)
            if not ok:
                rejected.append((entry["id"], how))
                continue
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(original_bytes(http, entry, cand)))).convert("RGB")
        if entry.get("crop"):  # optional curated crop, normalised box_2d; boxes in the manifest are relative to the crop
            im = im.crop(to_px(entry["crop"], *im.size))
        im = blur_regions(im, entry.get("plates", []))
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        folder = tmp / entry["category"]
        folder.mkdir(exist_ok=True)
        name = entry["id"]
        im.save(folder / f"{name}.webp", "WEBP", quality=80, method=6)  # saving without exif strips photographer GPS
        thumb = im.copy()
        thumb.thumbnail((THUMB_W, THUMB_W * 2), Image.Resampling.LANCZOS)
        thumb.save(folder / f"{name}-thumb.webp", "WEBP", quality=74, method=6)
        tiny = im.copy()
        tiny.thumbnail((BLUR_W, BLUR_W), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        tiny.filter(ImageFilter.GaussianBlur(1)).save(buf, "WEBP", quality=50)
        base = f"/assets/stock/{entry['category']}/{name}"
        credits.append({
            "id": name, "file": f"{base}.webp", "thumb": f"{base}-thumb.webp", "width": im.width, "height": im.height,
            "blur_data": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(),
            "title": cand.title, "author": cand.author, "source": cand.source, "source_url": cand.source_page,
            "licence": LICENCE_LABEL[cand.licence] + (f" {cand.licence_version}" if cand.licence_version and cand.licence in ("by", "by-sa") else ""),
            "licence_url": LICENCE_URL[cand.licence].format(v=cand.licence_version or "4.0"),
            "licence_verified_via": how, "modified": "Cropped, resized, number plates blurred" if entry.get("crop") else "Resized, number plates blurred",
        })
        print(f"  ✓ {name:<24} {cand.licence:<6} {cand.author[:30]}")
    (tmp / "CREDITS.json").write_text(json.dumps({"generated_by": "server/scripts/fetch_stock_images.py", "images": credits,
                                                  "rejected": [{"id": i, "reason": r} for i, r in rejected]},
                                                 indent=2, ensure_ascii=False), encoding="utf-8")
    if rejected:
        print("Rejected:", *[f"  {i}: {r}" for i, r in rejected], sep="\n")
    sync_dir(tmp, OUT)
    # Record final dimensions and blur placeholders back into the manifest so the seed needs no image I/O.
    by_id = {c["id"]: c for c in credits}
    for entry in manifest["photos"]:
        c = by_id.get(entry["id"])
        entry["available"] = c is not None
        if c:
            entry.update({"url": c["file"], "thumb": c["thumb"], "width": c["width"], "height": c["height"], "blur_data": c["blur_data"],
                          "credit": {k: c[k] for k in ("author", "source", "source_url", "licence", "licence_url")}})
    write_json_sync(MANIFEST, manifest)
    print(f"Built {len(credits)} images into {OUT} ({len(rejected)} rejected)")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("discover")
    d.add_argument("category", choices=list(CATEGORIES))
    d.add_argument("--source", choices=["commons", "openverse", "pexels"])
    d.add_argument("--query", action="append", default=[])
    b = sub.add_parser("build")
    b.add_argument("--prune-legacy", action="store_true", help="drop the old neutral fallback-* placeholders")
    args = ap.parse_args()
    if args.cmd == "discover":
        discover(args.category, args.source, args.query)
    else:
        build(args.prune_legacy)


if __name__ == "__main__":
    main()
