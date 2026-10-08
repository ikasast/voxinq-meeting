"""How each line was said: loudness, pitch and voiced time, measured from a synthetic WAV.

Run with: python stt-service/test_voice.py   (numpy only)

A voice is stood in for by a harmonic tone — a fundamental and a few overtones, as a vowel has —
so the pitch found can be checked against the one written.
"""

from __future__ import annotations

import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))

import voice  # noqa: E402

RATE = 16000


def _voice(f0: float, seconds: float, level: float) -> np.ndarray:
    t = np.arange(int(seconds * RATE)) / RATE
    tone = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in range(1, 5))
    return level * tone / np.abs(tone).max()


def _write(folder: Path, parts: list[np.ndarray]) -> Path:
    path = folder / "m.wav"
    x = np.concatenate(parts)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return path


def test_finds_the_pitch_written():
    with tempfile.TemporaryDirectory() as d:
        path = _write(Path(d), [_voice(120, 2, 0.5), _voice(220, 2, 0.5)])
        low, high = voice.measure(path, [(0.0, 2.0), (2.0, 4.0)])
        assert abs(low["f0"] - 120) < 6, low
        assert abs(high["f0"] - 220) < 10, high


def test_tells_a_loud_line_from_a_quiet_one():
    with tempfile.TemporaryDirectory() as d:
        path = _write(Path(d), [_voice(150, 2, 0.6), _voice(150, 2, 0.06)])
        loud, quiet = voice.measure(path, [(0.0, 2.0), (2.0, 4.0)])
        # A tenth of the amplitude is twenty decibels down.
        assert 17 < loud["rmsDb"] - quiet["rmsDb"] < 23, (loud, quiet)


def test_counts_only_the_voiced_part():
    with tempfile.TemporaryDirectory() as d:
        silence = np.zeros(RATE)
        path = _write(Path(d), [silence, _voice(150, 1.5, 0.5), silence])
        (line,) = voice.measure(path, [(0.0, 3.5)])
        assert 1.3 < line["voicedS"] < 1.6, line


def test_answers_none_for_silence_pitch_and_for_a_span_past_the_end():
    with tempfile.TemporaryDirectory() as d:
        path = _write(Path(d), [np.zeros(RATE * 2)])
        quiet, past, backwards = voice.measure(path, [(0.0, 2.0), (5.0, 6.0), (1.0, 0.5)])
        assert quiet["f0"] is None and quiet["voicedS"] == 0.0
        assert past is None
        assert backwards is None


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
