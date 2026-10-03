"""Swap a freshly built folder into place file by file (Windows-safe: no directory renames, which fail while a dev
server or Explorer holds a handle on the folder). Each file lands atomically via os.replace; stale files are removed."""
from __future__ import annotations

import os
import shutil
from pathlib import Path


def sync_dir(built: Path, target: Path, *, keep: callable = lambda p: False) -> None:
    target.mkdir(parents=True, exist_ok=True)
    fresh = set()
    for src in built.rglob("*"):
        if src.is_file():
            rel = src.relative_to(built)
            fresh.add(rel)
            dst = target / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            os.replace(src, dst)
    for old in sorted(target.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        rel = old.relative_to(target)
        if old.is_file() and rel not in fresh and not keep(rel):
            old.unlink()
        elif old.is_dir() and not any(old.iterdir()):
            old.rmdir()
    shutil.rmtree(built, ignore_errors=True)
