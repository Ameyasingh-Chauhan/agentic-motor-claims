"""Small async-safe JSON repository with atomic writes and an in-process cache."""
from __future__ import annotations
import asyncio, json, os
from pathlib import Path
from typing import Any
from ..config import DATA_DIR

_locks: dict[Path, asyncio.Lock] = {}
_cache: dict[Path, Any] = {}

def _path(name: str | Path) -> Path:
    p = Path(name)
    return p if p.is_absolute() else DATA_DIR / p

def _lock(p: Path) -> asyncio.Lock:
    return _locks.setdefault(p, asyncio.Lock())

async def read_json(name: str | Path, default: Any = None) -> Any:
    p = _path(name)
    async with _lock(p):
        if p in _cache: return _cache[p]
        try: value = json.loads(p.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError): value = default
        _cache[p] = value
        return value

async def write_json(name: str | Path, value: Any) -> None:
    p = _path(name); p.parent.mkdir(parents=True, exist_ok=True)
    async with _lock(p):
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, p); _cache[p] = value

def invalidate(name: str | Path | None = None) -> None:
    if name is None: _cache.clear()
    else: _cache.pop(_path(name), None)
