"""Local files behind claim media/document URLs. App uploads: the original file kept beside the processed copy
(server/uploads/<claim>/, §11.6). Seeded/stock assets: client/public. Returns None when the file is not on disk."""
from __future__ import annotations

from pathlib import Path

from ..config import SERVER_DIR
from ..services import uploads

PUBLIC = SERVER_DIR.parent / "client" / "public"
AUDIO_MIME = {".webm": "audio/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav", ".aac": "audio/aac"}


def local_path(claim_id: str, url: str | None, original_url: str | None = None) -> Path | None:
    for u in (original_url, url):
        if not u:
            continue
        if u.startswith("/api/files/"):
            parts = u.split("/")
            p = uploads.safe_file(parts[3], parts[4]) if len(parts) >= 5 else None
        elif u.startswith("/assets/"):
            p = (PUBLIC / u.lstrip("/")).resolve()
            p = p if p.is_file() and PUBLIC.resolve() in p.parents else None
        else:
            p = None
        if p is not None:
            return p
    return None


def is_image(path: Path) -> bool:
    return path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".bmp", ".tif", ".tiff"}
