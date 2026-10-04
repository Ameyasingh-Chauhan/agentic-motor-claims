"""Every test runs against a temporary copy of server/data/ and server/uploads/ — never the real files.

The copy is made when pytest imports this file (before any test module imports the app), and AMC_DATA_DIR / AMC_UPLOADS_DIR point
the app at it. After each test, any file the test changed, added or deleted is restored from a pristine copy, so tests never see
each other's writes either.
"""
from __future__ import annotations

import atexit
import os
import shutil
import tempfile
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parents[1]
_ROOT = Path(tempfile.mkdtemp(prefix="amc-tests-"))
PRISTINE = _ROOT / "pristine"
DATA = _ROOT / "data"
UPLOADS = _ROOT / "uploads"

shutil.copytree(SERVER / "data", PRISTINE / "data")
if (SERVER / "uploads").is_dir():
    shutil.copytree(SERVER / "uploads", PRISTINE / "uploads")
else:
    (PRISTINE / "uploads").mkdir(parents=True)
shutil.copytree(PRISTINE / "data", DATA)
shutil.copytree(PRISTINE / "uploads", UPLOADS)
os.environ["AMC_DATA_DIR"] = str(DATA)
os.environ["AMC_UPLOADS_DIR"] = str(UPLOADS)
# Never reach Vertex from tests: demo mode by default; tests of the live path replace gemini._transport with a fake.
os.environ["LLM_MODE"] = "demo"
os.environ["AMC_MOCK_LATENCY_SCALE"] = "0"
os.environ["PIPELINE_MIN_STEP_MS"] = "0"
os.environ["AMC_PIPELINE_AUTOSTART"] = "0"
atexit.register(shutil.rmtree, _ROOT, ignore_errors=True)


def _snapshot(folder: Path) -> dict[str, tuple[int, int]]:
    return {f.relative_to(folder).as_posix(): (f.stat().st_size, f.stat().st_mtime_ns) for f in folder.rglob("*") if f.is_file()}


_PRISTINE_DATA = _snapshot(DATA)


def _restore() -> None:
    """Put data/ back exactly as copied (only touching what changed) and empty uploads/ back to its pristine state."""
    now = _snapshot(DATA)
    for rel in set(now) - set(_PRISTINE_DATA):
        (DATA / rel).unlink()
    for rel, stamp in _PRISTINE_DATA.items():
        if now.get(rel) != stamp:
            shutil.copy2(PRISTINE / "data" / rel, DATA / rel)
    if _snapshot(UPLOADS) != _snapshot(PRISTINE / "uploads"):
        shutil.rmtree(UPLOADS)
        shutil.copytree(PRISTINE / "uploads", UPLOADS)


@pytest.fixture(autouse=True)
def isolated_data():
    """Guard: the app must be pointed at the temporary copy; restore it after the test."""
    from app import config
    from app.services import json_store

    assert config.DATA_DIR == DATA and config.UPLOADS_DIR == UPLOADS, "tests must never use the real server/data/"
    yield DATA
    _restore()
    json_store.invalidate()


@pytest.fixture
def uploads_dir() -> Path:
    return UPLOADS
