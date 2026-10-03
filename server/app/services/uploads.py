"""Upload processing (spec §11.6, §17 POST /uploads): private storage in server/uploads/<claim_id>/, processed on arrival.

Images → WebP (longest side ≤ 1600 px, never upscaled) + 320 px thumbnail + base64 blur placeholder; EXIF capture time, GPS and
device are extracted; a quality score (blur = variance of the Laplacian on a ≤ 800 px greyscale copy, brightness = mean luminance)
is computed. The original file is kept beside the processed copy for the agents (Phase 5). PDFs, audio and video are stored as-is.
All functions here are synchronous CPU/file work; routers call them through `asyncio.to_thread`.
"""
from __future__ import annotations

import base64
import io
import mimetypes
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

from .. import config

IST = timezone(timedelta(hours=5, minutes=30))
MAX_SIDE, THUMB_W, BLUR_W = 1600, 320, 16
MAX_BYTES = 25 * 1024 * 1024
KINDS = {"photo", "video", "audio", "document"}
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif"}
ALLOWED = {
    "photo": IMAGE_TYPES,
    "document": IMAGE_TYPES | {"application/pdf"},
    "audio": {"audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm", "audio/wav", "audio/x-wav", "audio/x-m4a"},
    "video": {"video/mp4", "video/webm", "video/quicktime"},
}
BLUR_OK, BRIGHT_RANGE = 100.0, (0.18, 0.92)


class UploadError(ValueError):
    """A user-facing validation problem with the uploaded file (→ HTTP 422)."""


def claim_dir(claim_id: str) -> Path:
    return config.UPLOADS_DIR / claim_id


def file_url(claim_id: str, name: str) -> str:
    return f"/api/files/{claim_id}/{name}"


def safe_file(claim_id: str, name: str) -> Path | None:
    """Resolve a requested file name inside the claim's folder; None for anything that tries to escape it."""
    if not name or name != Path(name).name or name.startswith("."):
        return None
    folder = claim_dir(claim_id).resolve()
    path = (folder / name).resolve()
    return path if path.parent == folder and path.is_file() else None


# Explicit map: the Windows MIME registry often lacks .webp/.avif, which would serve images as application/octet-stream.
TYPES_BY_EXT = {".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                ".pdf": "application/pdf", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg",
                ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav", ".aac": "audio/aac"}


def media_type(path: Path) -> str:
    return TYPES_BY_EXT.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def _mime(filename: str, declared: str | None) -> str:
    guessed = TYPES_BY_EXT.get(Path(filename).suffix.lower()) or mimetypes.guess_type(filename)[0]
    declared = (declared or "").split(";")[0].strip().lower()
    return declared if declared and declared != "application/octet-stream" else (guessed or "application/octet-stream")


def _rational(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError, ZeroDivisionError):
        return float(v[0]) / float(v[1]) if isinstance(v, tuple) and v[1] else 0.0


def _gps(gps: dict) -> tuple[float | None, float | None]:
    def coord(value, ref):
        if not value:
            return None
        d, m, s = (_rational(x) for x in value)
        out = d + m / 60 + s / 3600
        return round(-out if ref in ("S", "W") else out, 6)
    return coord(gps.get(2), gps.get(1)), coord(gps.get(4), gps.get(3))


def read_exif(im: Image.Image) -> dict:
    """{captured_at (ISO, IST assumed for camera local time), lat, lng, device} — None for anything missing."""
    exif = im.getexif()
    sub = exif.get_ifd(0x8769)
    raw = sub.get(36867) or sub.get(36868) or exif.get(306)
    captured = None
    if raw:
        try:
            captured = datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S").replace(tzinfo=IST).isoformat()
        except ValueError:
            captured = None
    lat, lng = _gps(exif.get_ifd(0x8825))
    make, model = (str(exif.get(t) or "").strip("\x00 ") for t in (271, 272))
    device = model if make and model.lower().startswith(make.lower()) else " ".join(x for x in (make, model) if x) or None
    return {"captured_at": captured, "lat": lat, "lng": lng, "device": device}


def quality(im: Image.Image, *, document: bool = False) -> dict:
    """Photos need sharpness and sensible exposure; documents are mostly white paper, so only sharpness and a minimum brightness."""
    grey = ImageOps.grayscale(im)
    grey.thumbnail((800, 800))
    arr = np.asarray(grey, dtype=np.uint8)
    blur = float(cv2.Laplacian(arr, cv2.CV_64F).var())
    brightness = float(arr.mean() / 255)
    exposed = brightness >= BRIGHT_RANGE[0] if document else BRIGHT_RANGE[0] <= brightness <= BRIGHT_RANGE[1]
    return {"blur_score": round(blur, 1), "brightness": round(brightness, 2), "ok": blur >= BLUR_OK and exposed}


def _blur_data(im: Image.Image) -> str:
    tiny = im.copy()
    tiny.thumbnail((BLUR_W, BLUR_W))
    buf = io.BytesIO()
    tiny.filter(ImageFilter.GaussianBlur(1)).save(buf, "WEBP", quality=50)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def process(claim_id: str, *, kind: str, filename: str, content_type: str | None, data: bytes) -> dict:
    """Validate + store one upload under a temporary token name. Returns {"token", "files", "fields"}; `finalise` renames the files to
    the claim's next media/document id once that id is allocated under the claims.json lock."""
    if kind not in KINDS:
        raise UploadError(f"Unknown kind '{kind}' (expected one of {', '.join(sorted(KINDS))})")
    if not data:
        raise UploadError("The file is empty")
    if len(data) > MAX_BYTES:
        raise UploadError(f"File is larger than {MAX_BYTES // (1024 * 1024)} MB")
    mime = _mime(filename, content_type)
    if mime not in ALLOWED[kind]:
        raise UploadError(f"{mime} is not accepted for a {kind}")
    folder = claim_dir(claim_id)
    folder.mkdir(parents=True, exist_ok=True)
    token = "tmp-" + secrets.token_hex(6)
    ext = (Path(filename).suffix.lower() or mimetypes.guess_extension(mime) or ".bin")[:8]
    files: dict[str, str] = {}
    fields: dict = {"mime": mime, "size_kb": max(1, round(len(data) / 1024)), "original_name": Path(filename).name[:120]}

    (folder / f"{token}-original{ext}").write_bytes(data)
    files["original"] = f"-original{ext}"
    if mime in IMAGE_TYPES:
        try:
            src = Image.open(io.BytesIO(data))
            exif = read_exif(src)
            im = ImageOps.exif_transpose(src).convert("RGB")
        except (UnidentifiedImageError, OSError) as e:
            (folder / f"{token}-original{ext}").unlink(missing_ok=True)
            raise UploadError("The file could not be read as an image") from e
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        im.save(folder / f"{token}.webp", "WEBP", quality=82, method=4)  # no exif → GPS is not repeated in the served copy
        thumb = im.copy()
        thumb.thumbnail((THUMB_W, THUMB_W * 2), Image.Resampling.LANCZOS)
        thumb.save(folder / f"{token}-thumb.webp", "WEBP", quality=76, method=4)
        files |= {"main": ".webp", "thumb": "-thumb.webp"}
        fields |= {"width": im.width, "height": im.height, "blur_data": _blur_data(im), "exif": exif, "quality": quality(im, document=kind == "document")}
    else:
        files["main"] = files["original"]
    return {"token": token, "files": files, "fields": fields}


def finalise(claim_id: str, processed: dict, item_id: str) -> dict:
    """Rename the token files to `<item_id>…` and return url/thumb for the claim record."""
    folder = claim_dir(claim_id)
    out = {}
    for role, suffix in processed["files"].items():
        src = folder / f"{processed['token']}{suffix}"
        dst = folder / f"{item_id}{suffix}"
        if src.exists():
            src.replace(dst)
        out[role] = file_url(claim_id, dst.name)
    return {"url": out["main"], "thumb": out.get("thumb"), "original_url": out["original"]}


def discard(claim_id: str, processed: dict) -> None:
    folder = claim_dir(claim_id)
    for suffix in set(processed["files"].values()):
        (folder / f"{processed['token']}{suffix}").unlink(missing_ok=True)


def remove(claim_id: str, item_id: str) -> None:
    folder = claim_dir(claim_id)
    for f in folder.glob(f"{item_id}*"):
        if f.name == item_id or f.name.startswith((f"{item_id}.", f"{item_id}-")):
            f.unlink(missing_ok=True)
