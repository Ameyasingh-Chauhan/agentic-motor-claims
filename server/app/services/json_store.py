"""Async-safe JSON repository (spec §8.7, §11.6): per-file locks, atomic writes, an mtime-checked in-process cache.

- Reads return the cached value while the file's mtime is unchanged, so an external edit or a re-seed is picked up on the next
  read without restarting uvicorn.
- File I/O runs in a worker thread (`asyncio.to_thread`) so a 5 MB claims.json never blocks the event loop.
- `update_json` is the read-modify-write primitive: the whole cycle runs under the file's lock, so two concurrent requests
  appending claims can never lose one another's write.
- Every write replaces the cached value immediately (callers see their own write; no restart, no stale KPIs).
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Callable

from .. import config

_locks: dict[tuple[int, Path], asyncio.Lock] = {}   # (event loop, path) → lock; a Lock must never cross event loops
_cache: dict[Path, tuple[int, Any]] = {}            # path → (mtime_ns, value)


def _path(name: str | Path) -> Path:
    p = Path(name)
    return p if p.is_absolute() else config.DATA_DIR / p


def _lock(p: Path) -> asyncio.Lock:
    return _locks.setdefault((id(asyncio.get_running_loop()), p), asyncio.Lock())


def _mtime(p: Path) -> int | None:
    try:
        return p.stat().st_mtime_ns
    except FileNotFoundError:
        return None


def _load(p: Path, default: Any) -> tuple[int | None, Any]:
    mtime = _mtime(p)
    if mtime is None:
        return None, default
    try:
        return mtime, json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return mtime, default


def _atomic_write(p: Path, value: Any) -> int:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, p)
    return p.stat().st_mtime_ns


async def _read_locked(p: Path, default: Any) -> Any:
    cached = _cache.get(p)
    if cached is not None and cached[0] == await asyncio.to_thread(_mtime, p):
        return cached[1]
    mtime, value = await asyncio.to_thread(_load, p, default)
    if mtime is not None:
        _cache[p] = (mtime, value)
    else:
        _cache.pop(p, None)
    return value


async def read_json(name: str | Path, default: Any = None) -> Any:
    p = _path(name)
    async with _lock(p):
        return await _read_locked(p, default)


async def write_json(name: str | Path, value: Any) -> None:
    p = _path(name)
    async with _lock(p):
        try:
            _cache[p] = (await asyncio.to_thread(_atomic_write, p, value), value)
        except BaseException:
            _cache.pop(p, None)
            raise


async def update_json(name: str | Path, fn: Callable[[Any], Any], default: Any = None) -> Any:
    """Read → `fn(value)` (mutates the value in place) → atomic write, all under the file's lock. Returns whatever `fn` returns.
    If `fn` raises, nothing is written and the cache is dropped."""
    p = _path(name)
    async with _lock(p):
        value = await _read_locked(p, default)
        try:
            result = fn(value)
            _cache[p] = (await asyncio.to_thread(_atomic_write, p, value), value)
        except BaseException:
            _cache.pop(p, None)  # fn may have half-mutated the cached object: force a clean re-read
            raise
        return result


def read_json_sync(name: str | Path, default: Any = None) -> Any:
    """Synchronous read for scripts and startup code (seed, reference loading). Bypasses the cache."""
    return _load(_path(name), default)[1]


def write_json_sync(name: str | Path, value: Any) -> None:
    """Synchronous atomic write for scripts (seed). Drops any cached copy so the server re-reads it."""
    p = _path(name)
    _atomic_write(p, value)
    _cache.pop(p, None)


def invalidate(name: str | Path | None = None) -> None:
    """Explicitly drop cached files (all of them when `name` is None)."""
    if name is None:
        _cache.clear()
    else:
        _cache.pop(_path(name), None)
