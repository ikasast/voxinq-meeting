"""Cutting a recording down to the part worth keeping.

For a meeting that was left recording after it ended: hours of a quiet room, with whatever the
recogniser made of it scattered through the transcript. The WAV is cut to [start, end), and the
utterance boundaries saved beside it are dropped and moved back to match, so every position the
web app seeks by still lands on the same words.

Standard library only, so it can be tested anywhere; server.py wires it to the HTTP endpoint.
"""

from __future__ import annotations

import json
import os
import shutil
import time
import wave
from pathlib import Path


def shift_times(item: dict, head: float, length: float, keys: tuple[str, str]) -> dict:
    """A copy of `item` with its two time fields moved back by `head`, kept inside the recording."""
    out = dict(item)
    for k in keys:
        if isinstance(out.get(k), (int, float)) and not isinstance(out.get(k), bool):
            out[k] = round(min(max(float(out[k]) - head, 0.0), length), 3)
    return out


def put_in_place(tmp: Path, target: Path, tries: int = 10) -> None:
    """Move the cut copy over the original.

    On Windows a file that is open cannot be replaced, and the player used to find where to cut
    usually still has the recording open (the web page lets go of it first, but the server notices
    a moment later). It can still be written to, so after a few tries the cut copy is written over
    the original instead. If even that fails the cut copy is left beside it, as the only whole one.
    """
    for _ in range(tries):
        try:
            os.replace(tmp, target)
            return
        except PermissionError:
            time.sleep(0.2)
    with open(tmp, "rb") as src, open(target, "r+b") as dst:
        shutil.copyfileobj(src, dst, 1024 * 1024)
        dst.truncate()
    tmp.unlink()


def trim_recording(
    paths: dict[str, Path], start_ms: int, end_ms: int, drop: list[int], expected: int
) -> dict:
    """Keep [start_ms, end_ms) of paths["wav"], and the boundaries in paths["seg"] that go with it.

    Which boundaries leave is the caller's decision (`drop`, by index) when there are
    `expected` of them: each is a transcript row in the web app, diarization pairs the two by
    position, and they must leave together. When the counts differ the boundaries are judged by
    their own times instead, and `synced` is False. Cached speaker results describe the
    recording as it was, so they are removed. There is no undo.
    """
    wav_path = paths["wav"]
    before = wav_path.stat()
    tmp_path = wav_path.with_name(wav_path.name + ".trim")
    with wave.open(str(wav_path), "rb") as src:
        rate = src.getframerate()
        channels, width, total = src.getnchannels(), src.getsampwidth(), src.getnframes()
        first = min(total, round(start_ms * rate / 1000))
        last = min(total, round(end_ms * rate / 1000))
        if last - first < rate:
            raise ValueError("less than a second would be left")
        # A slice at a time: a recording left running overnight is close to a gigabyte.
        try:
            with wave.open(str(tmp_path), "wb") as dst:
                dst.setnchannels(channels)
                dst.setsampwidth(width)
                dst.setframerate(rate)
                src.setpos(first)
                left = last - first
                while left > 0:
                    frames = src.readframes(min(rate * 30, left))
                    if not frames:
                        break
                    dst.writeframes(frames)
                    left -= len(frames) // (width * channels)
        except BaseException:
            tmp_path.unlink(missing_ok=True)  # the original is untouched; leave no half copy
            raise
    put_in_place(tmp_path, wav_path)
    # Trimming is not new audio: the recording keeps the retention deadline it had.
    os.utime(wav_path, (before.st_atime, before.st_mtime))

    head, length = first / rate, (last - first) / rate
    synced, count = False, 0
    try:
        segments = json.loads(paths["seg"].read_text(encoding="utf-8"))
    except (OSError, ValueError):  # no boundaries saved — nothing to move
        segments = None
    if isinstance(segments, list):
        if len(segments) == expected:
            gone = set(drop)
            kept = [seg for i, seg in enumerate(segments) if i not in gone]
            synced = True
        else:
            kept = [
                seg
                for seg in segments
                if isinstance(seg, dict)
                and float(seg.get("end", 0.0)) > head
                and float(seg.get("start", 0.0)) < head + length
            ]
        moved = []
        for seg in kept:
            if not isinstance(seg, dict):
                continue
            seg = shift_times(seg, head, length, ("start", "end"))
            if isinstance(seg.get("words"), list):
                seg["words"] = [
                    shift_times(w, head, length, ("s", "e")) if isinstance(w, dict) else w
                    for w in seg["words"]
                ]
            moved.append(seg)
        paths["seg"].write_text(json.dumps(moved, ensure_ascii=False), encoding="utf-8")
        count = len(moved)

    for key in ("spk", "emb", "model", "key", "pcs", "req"):
        if key in paths:
            paths[key].unlink(missing_ok=True)
    return {
        "ok": True,
        "beforeMs": round(total * 1000 / rate),
        "headMs": round(head * 1000),
        "durationMs": round(length * 1000),
        "synced": synced,
        "count": count,
    }
