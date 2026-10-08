"""How each line was said: its loudness, its pitch and how much of it was voiced.

For the Voice cues extension. No model: arithmetic over the recording, a line at a time. The
figures are absolute and mean little alone — a quiet microphone, a far seat, a phone in a room
all move them — so the web app compares each line with the same speaker's own lines in the same
meeting, and shows only where one stands out.

Pitch is a plain autocorrelation over short frames. It is not a tracker that follows a voice
through noise; it is enough to say that a line was pitched above or below where the speaker
usually is, which is all it is asked.
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

FRAME_S = 0.04  # long enough for two periods of a 60 Hz voice
HOP_S = 0.01
F0_MIN, F0_MAX = 70.0, 400.0
# A frame counts as voiced when it is within this much of the line's loudest frame and its
# autocorrelation has a clear peak in the voice range.
VOICED_WITHIN_DB = 30.0
PERIODIC_AT = 0.45


def _read(w: wave.Wave_read, start_s: float, end_s: float) -> np.ndarray:
    rate, total = w.getframerate(), w.getnframes()
    first = max(0, min(total, int(start_s * rate)))
    last = max(first, min(total, int(end_s * rate)))
    w.setpos(first)
    raw = w.readframes(last - first)
    width, channels = w.getsampwidth(), w.getnchannels()
    if width != 2:
        raise ValueError(f"expected 16-bit PCM, got {width * 8}-bit")
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        x = x.reshape(-1, channels).mean(axis=1)
    return x


def _frames(x: np.ndarray, size: int, hop: int) -> np.ndarray:
    if len(x) < size:
        return np.empty((0, size), dtype=np.float32)
    n = 1 + (len(x) - size) // hop
    idx = np.arange(size)[None, :] + hop * np.arange(n)[:, None]
    return x[idx]


def measure_line(x: np.ndarray, rate: int) -> dict | None:
    """Loudness (dBFS of the voiced frames), median pitch in Hz, and voiced seconds."""
    size, hop = int(FRAME_S * rate), int(HOP_S * rate)
    frames = _frames(x, size, hop)
    if len(frames) == 0:
        return None
    frames = frames - frames.mean(axis=1, keepdims=True)
    energy = np.sqrt((frames**2).mean(axis=1)) + 1e-9
    db = 20 * np.log10(energy)
    loud = db >= db.max() - VOICED_WITHIN_DB

    # Autocorrelation of every frame at once, through the FFT, normalised by lag 0.
    n = 1 << (2 * size - 1).bit_length()
    spec = np.fft.rfft(frames, n=n, axis=1)
    ac = np.fft.irfft(spec * np.conj(spec), n=n, axis=1)[:, :size]
    ac = ac / (ac[:, :1] + 1e-12)
    lo, hi = int(rate / F0_MAX), min(size - 1, int(rate / F0_MIN))
    window = ac[:, lo:hi]
    peak = window.argmax(axis=1)
    strength = window[np.arange(len(window)), peak]
    voiced = loud & (strength >= PERIODIC_AT)
    if not voiced.any():
        return {"rmsDb": float(20 * np.log10(np.sqrt((x**2).mean()) + 1e-9)), "f0": None, "voicedS": 0.0}

    f0 = rate / (peak[voiced] + lo)
    return {
        "rmsDb": float(20 * np.log10(np.sqrt((energy[voiced] ** 2).mean()))),
        "f0": float(np.median(f0)),
        "voicedS": round(float(voiced.sum() * HOP_S), 3),
    }


def measure(wav_path: Path, spans: list[tuple[float, float]]) -> list[dict | None]:
    """One answer per span, in order; None for a span the recording does not reach."""
    out: list[dict | None] = []
    with wave.open(str(wav_path), "rb") as w:
        rate = w.getframerate()
        for start, end in spans:
            if not (end > start >= 0):
                out.append(None)
                continue
            out.append(measure_line(_read(w, start, end), rate))
    return out
