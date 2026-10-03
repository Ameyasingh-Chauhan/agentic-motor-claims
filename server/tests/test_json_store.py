"""json_store (§8.7, §11.6): mtime-checked cache, locked read-modify-write, atomic writes."""
import asyncio
import json
import os

import pytest

from app.services import json_store


def run(coro):
    return asyncio.run(coro)


def test_external_edit_is_picked_up_without_restart(isolated_data):
    path = isolated_data / "scratch.json"
    path.write_text(json.dumps({"v": 1}), encoding="utf-8")
    assert run(json_store.read_json("scratch.json"))["v"] == 1
    path.write_text(json.dumps({"v": 2}), encoding="utf-8")
    st = path.stat()
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))  # make sure the mtime differs even on coarse clocks
    assert run(json_store.read_json("scratch.json"))["v"] == 2


def test_concurrent_updates_never_lose_a_write(isolated_data):
    (isolated_data / "counter.json").write_text("[]", encoding="utf-8")

    async def main():
        await asyncio.gather(*(json_store.update_json("counter.json", lambda rows, i=i: rows.append(i)) for i in range(50)))
        return await json_store.read_json("counter.json")

    assert sorted(run(main())) == list(range(50))
    assert sorted(json.loads((isolated_data / "counter.json").read_text(encoding="utf-8"))) == list(range(50))


def test_failed_update_writes_nothing_and_drops_the_half_mutated_cache(isolated_data):
    (isolated_data / "atomic.json").write_text('{"items": [1]}', encoding="utf-8")

    def boom(value):
        value["items"].append(2)
        raise ValueError("validation failed")

    with pytest.raises(ValueError):
        run(json_store.update_json("atomic.json", boom))
    assert run(json_store.read_json("atomic.json")) == {"items": [1]}
    assert not (isolated_data / "atomic.json.tmp").exists()
