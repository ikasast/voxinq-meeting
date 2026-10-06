"""Trimming a recording: the audio, the boundaries beside it, and what is left alone.

Run with: python -m pytest stt-service/test_trim.py   (or plain `python test_trim.py`)

Standard library only: a ten-second WAV is written to a temporary folder and cut.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import trim  # noqa: E402

RATE = 16000


def _recording(folder: Path, seconds: int = 10) -> dict[str, Path]:
    paths = {
        "wav": folder / "m.wav",
        "seg": folder / "m.segments.json",
        "spk": folder / "m.speakers.json",
        "emb": folder / "m.embeddings.json",
        "key": folder / "m.speakers.key",
        "pcs": folder / "m.pieces.json",
        "req": folder / "m.request.json",
    }
    with wave.open(str(paths["wav"]), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        # Each second carries its own number, so where the cut landed can be read back.
        w.writeframes(b"".join(bytes([i, 0]) * RATE for i in range(seconds)))
    segments = [
        {"start": 0.5, "end": 1.5, "words": [{"w": "a", "s": 0.5, "e": 1.0}]},
        {"start": 2.5, "end": 3.5, "words": [{"w": "b", "s": 2.5, "e": 3.5}]},
        {"start": 1.5, "end": 2.5},  # straddles the start, kept by the caller
        {"start": 8.0, "end": 9.0},
    ]
    paths["seg"].write_text(json.dumps(segments), encoding="utf-8")
    for key in ("spk", "emb", "key", "pcs", "req"):
        paths[key].write_text("[]", encoding="utf-8")
    old = 1_700_000_000
    os.utime(paths["wav"], (old, old))
    return paths


def test_keeps_the_range_and_moves_the_boundaries_back():
    with tempfile.TemporaryDirectory() as d:
        paths = _recording(Path(d))
        result = trim.trim_recording(paths, 2000, 7000, drop=[0, 3], expected=4)
        assert result["durationMs"] == 5000 and result["beforeMs"] == 10000 and result["headMs"] == 2000
        assert result["synced"] is True and result["count"] == 2
        with wave.open(str(paths["wav"]), "rb") as w:
            assert w.getnframes() == 5 * RATE
            assert w.readframes(1)[0] == 2  # the first second kept is second 2
        segments = json.loads(paths["seg"].read_text(encoding="utf-8"))
        assert segments[0]["start"] == 0.5 and segments[0]["end"] == 1.5
        assert segments[0]["words"][0] == {"w": "b", "s": 0.5, "e": 1.5}
        # A boundary that began before the cut starts at zero rather than below it.
        assert segments[1] == {"start": 0.0, "end": 0.5}


def test_keeps_the_retention_deadline_and_drops_speaker_results():
    with tempfile.TemporaryDirectory() as d:
        paths = _recording(Path(d))
        trim.trim_recording(paths, 0, 5000, drop=[3], expected=4)
        assert int(paths["wav"].stat().st_mtime) == 1_700_000_000
        for key in ("spk", "emb", "key", "pcs", "req"):
            assert not paths[key].exists(), key


def test_judges_boundaries_by_time_when_out_of_step():
    with tempfile.TemporaryDirectory() as d:
        paths = _recording(Path(d))
        result = trim.trim_recording(paths, 2000, 7000, drop=[], expected=99)
        assert result["synced"] is False
        segments = json.loads(paths["seg"].read_text(encoding="utf-8"))
        # 0.5–1.5 and 8–9 lie outside; 2.5–3.5 and the straddling 1.5–2.5 are inside.
        assert [(s["start"], s["end"]) for s in segments] == [(0.5, 1.5), (0.0, 0.5)]


def test_refuses_to_leave_less_than_a_second():
    with tempfile.TemporaryDirectory() as d:
        paths = _recording(Path(d))
        try:
            trim.trim_recording(paths, 3000, 3500, drop=[], expected=4)
        except ValueError:
            pass
        else:
            raise AssertionError("a half-second recording was left")
        with wave.open(str(paths["wav"]), "rb") as w:
            assert w.getnframes() == 10 * RATE  # untouched


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
