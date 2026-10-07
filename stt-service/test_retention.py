"""The retention sweep: what goes with a recording, and what is left alone.

Run with: python -m pytest stt-service/test_retention.py   (or plain `python test_retention.py`)

Standard library only: a folder of small stand-in files is written and swept.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import retention  # noqa: E402

DAY = 86400
NOW = 1_800_000_000.0


def _recording(folder: Path, mid: str, age_days: float, *, keep: bool = False, wav: bool = True) -> dict[str, Path]:
    files = retention.recording_files(folder, mid)
    for role, f in files.items():
        if role == "keep" and not keep:
            continue
        if role == "wav" and not wav:
            continue
        f.write_bytes(b"x")
        os.utime(f, (NOW - age_days * DAY, NOW - age_days * DAY))
    return files


def test_an_expired_recording_goes_with_everything_beside_it():
    with tempfile.TemporaryDirectory() as d:
        files = _recording(Path(d), "old", 8)
        gone, stray = retention.sweep(Path(d), 7, NOW)
        assert gone == ["old"] and stray == 0
        assert [f.name for f in files.values() if f.exists()] == []


def test_a_recent_or_protected_recording_stays():
    with tempfile.TemporaryDirectory() as d:
        recent = _recording(Path(d), "recent", 3)
        kept = _recording(Path(d), "kept", 30, keep=True)
        gone, stray = retention.sweep(Path(d), 7, NOW)
        assert gone == [] and stray == 0
        assert all(f.exists() for role, f in recent.items() if role != "keep")
        assert all(f.exists() for f in kept.values())


def test_files_an_older_sweep_left_are_cleared():
    # The old sweep deleted four files by name; the request, its fingerprint, the pieces and
    # the embedding model stayed, with no WAV left to go with.
    with tempfile.TemporaryDirectory() as d:
        files = _recording(Path(d), "left", 20, wav=False)
        gone, stray = retention.sweep(Path(d), 7, NOW)
        assert gone == [] and stray == len(files) - 2  # all but the WAV and the .keep, never written
        assert [f.name for f in files.values() if f.exists()] == []


def test_recent_leftovers_and_other_files_are_not_its_to_judge():
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        young = _recording(folder, "young", 1, wav=False)
        other = folder / "notes.txt"
        other.write_text("not a recording")
        os.utime(other, (NOW - 90 * DAY, NOW - 90 * DAY))
        trim_copy = folder / "busy.wav.trim"
        trim_copy.write_bytes(b"x")
        os.utime(trim_copy, (NOW - 90 * DAY, NOW - 90 * DAY))
        gone, stray = retention.sweep(folder, 7, NOW)
        assert gone == [] and stray == 0
        assert all(f.exists() for role, f in young.items() if role not in ("wav", "keep"))
        assert other.exists() and trim_copy.exists()


def test_a_period_of_zero_turns_it_off():
    with tempfile.TemporaryDirectory() as d:
        files = _recording(Path(d), "old", 400)
        assert retention.sweep(Path(d), 0, NOW) == ([], 0)
        assert files["wav"].exists()


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ok   {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"  FAIL {name}: {type(e).__name__}: {e}")
    print("all passed" if not failed else f"{failed} failed")
    sys.exit(1 if failed else 0)
