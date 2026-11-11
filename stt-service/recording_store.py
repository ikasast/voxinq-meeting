"""A recording session's audio, written to disk as it arrives, and folded into the meeting's WAV.

The audio of a session used to be held in memory until the session ended, and only then written.
That cost twice over. Memory grew with the length of the meeting, and saving a two-hour session
made several more whole copies of it. A process killed before the save lost the session's audio
outright: the transcript survived, because it is written line by line, but the recording was
whatever earlier sessions had left. This happened in production: a two-hour session was lost to
the out-of-memory killer at the moment it was being saved, and a two-second false start was all
the meeting had left.

So each session now writes what it receives to a part file beside the recording, and the
utterance boundaries to a second one. The part files are flushed on every write, so a killed
process leaves them on disk. When the session ends, the part is appended to the WAV in blocks.
A part that no session owns any more, because the process died, is folded at the next start.

Folding can itself be cut short. Before it touches anything, it writes down where the WAV and the
boundaries stood (``.base``). A fold that runs again truncates back to that point first, so a
part is never appended twice and a half-written tail never stays.

The WAV is the one Python's ``wave`` module writes: a 44-byte header, 16-bit mono PCM. Appending
in place needs that header, and anything else already on disk is rewritten to it once.

Standard library only, so it can be tested anywhere; server.py wires it to the WebSocket.
"""

from __future__ import annotations

import json
import os
import threading
import time
import wave
from pathlib import Path

HEADER = 44
SAMPLE_WIDTH = 2
BLOCK = 1 << 20

_PART = ".part"
_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()
# Part files a live session in this process is still writing. Anything else is an orphan.
_ACTIVE: set[str] = set()


def _lock(mid: str) -> threading.Lock:
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(mid, threading.Lock())


class PartWriter:
    """One session's audio and utterance boundaries, on disk from the first chunk."""

    def __init__(self, folder: Path, mid: str) -> None:
        folder.mkdir(parents=True, exist_ok=True)
        # Named by time so orphans fold in the order they were recorded.
        self.stem = f"{mid}.{time.time_ns():020d}{_PART}"
        self.folder = folder
        self.mid = mid
        self.samples = 0
        _ACTIVE.add(self.stem)
        self._pcm = open(folder / f"{self.stem}.pcm", "ab")
        self._finals = open(folder / f"{self.stem}.jsonl", "a", encoding="utf-8")

    def write(self, pcm16: bytes) -> None:
        self._pcm.write(pcm16)
        # Out of this process's buffer, so a killed process still leaves it on disk.
        self._pcm.flush()
        self.samples += len(pcm16) // SAMPLE_WIDTH

    def add_final(self, entry: dict) -> None:
        self._finals.write(json.dumps(entry, ensure_ascii=False) + "\n")
        self._finals.flush()

    def close(self) -> None:
        for f in (self._pcm, self._finals):
            try:
                f.close()
            except OSError:
                pass

    def fold(self, rate: int) -> None:
        """Append this session to the meeting's recording. The part files go once it is in."""
        self.close()
        try:
            fold(self.folder, self.mid, self.stem, rate)
        finally:
            _ACTIVE.discard(self.stem)

    def abandon(self) -> None:
        """Stop owning the part without folding it: the next start folds it instead."""
        self.close()
        _ACTIVE.discard(self.stem)


def orphans(folder: Path, mid: str | None = None) -> list[tuple[str, str]]:
    """Part files no live session owns, as (meeting id, stem), oldest first."""
    found = []
    pattern = f"{mid}.*{_PART}.pcm" if mid else f"*{_PART}.pcm"
    for p in folder.glob(pattern):
        stem = p.name[: -len(".pcm")]
        if stem in _ACTIVE:
            continue
        found.append((stem.split(".", 1)[0], stem))
    return sorted(found, key=lambda m: m[1])


def recover(folder: Path, rate: int, mid: str | None = None) -> list[str]:
    """Fold every orphaned part into its recording. Returns the meetings that changed."""
    changed: list[str] = []
    for owner, stem in orphans(folder, mid):
        try:
            fold(folder, owner, stem, rate)
        except Exception as e:  # noqa: BLE001  one bad part must not keep the others out
            print(f"[recording] could not recover {stem}: {e}")
            continue
        if owner not in changed:
            changed.append(owner)
    return changed


def discard(folder: Path, mid: str) -> None:
    """Remove the parts of a meeting no live session owns (its recording is being deleted)."""
    for _owner, stem in orphans(folder, mid):
        for ext in (".pcm", ".jsonl", ".base"):
            (folder / f"{stem}{ext}").unlink(missing_ok=True)


def fold(folder: Path, mid: str, stem: str, rate: int) -> None:
    """Append part `stem` to `mid`'s WAV and its boundaries to the segments file. Idempotent."""
    pcm = folder / f"{stem}.pcm"
    finals = folder / f"{stem}.jsonl"
    base_path = folder / f"{stem}.base"
    wav = folder / f"{mid}.wav"
    seg = folder / f"{mid}.segments.json"
    with _lock(mid):
        try:
            base = json.loads(base_path.read_text(encoding="utf-8"))
            base_bytes, base_segments = int(base["bytes"]), int(base["segments"])
        except (FileNotFoundError, ValueError, KeyError, TypeError):
            base_bytes = _canonical(wav, rate)
            base_segments = len(_read_segments(seg))
            _write_atomic(base_path, json.dumps({"bytes": base_bytes, "segments": base_segments}))

        size = pcm.stat().st_size if pcm.exists() else 0
        size -= size % SAMPLE_WIDTH  # a write cut off mid-sample
        if not wav.exists():
            _write_header(wav, rate)
        with open(wav, "r+b") as out:
            out.truncate(HEADER + base_bytes)
            out.seek(0, os.SEEK_END)
            if size:
                with open(pcm, "rb") as src:
                    left = size
                    while left:
                        block = src.read(min(BLOCK, left))
                        if not block:
                            break
                        out.write(block)
                        left -= len(block)
            data = out.tell() - HEADER
            out.seek(4)
            out.write((data + HEADER - 8).to_bytes(4, "little"))
            out.seek(40)
            out.write(data.to_bytes(4, "little"))
            out.flush()
            os.fsync(out.fileno())

        segments = _read_segments(seg)[:base_segments] + _read_finals(finals)
        _write_atomic(seg, json.dumps(segments, ensure_ascii=False))
        for f in (pcm, finals, base_path):
            f.unlink(missing_ok=True)


def wav_frames(wav: Path) -> int:
    """Frames in the WAV, from its header. 0 when there is none or it cannot be read."""
    try:
        with wave.open(str(wav), "rb") as w:
            return w.getnframes()
    except Exception:  # noqa: BLE001
        return 0


def _canonical(wav: Path, rate: int) -> int:
    """Make the WAV one this module can append to; return its data length in bytes.

    Absent: 0. Our own header: its data length, capped at what the file holds. Another layout of
    the same format: rewritten, in blocks. A different rate or channel count: replaced, as the
    session clock already treated it (see `_existing_recording_samples` in server.py).
    """
    if not wav.exists():
        return 0
    with open(wav, "rb") as f:
        head = f.read(HEADER)
    if _is_ours(head, rate):
        declared = int.from_bytes(head[40:44], "little")
        held = wav.stat().st_size - HEADER
        n = min(declared, held)
        return n - n % SAMPLE_WIDTH
    tmp = wav.with_name(wav.name + ".tmp")
    try:
        with wave.open(str(wav), "rb") as src:
            same = (
                src.getframerate() == rate
                and src.getnchannels() == 1
                and src.getsampwidth() == SAMPLE_WIDTH
            )
            with wave.open(str(tmp), "wb") as dst:
                dst.setnchannels(1)
                dst.setsampwidth(SAMPLE_WIDTH)
                dst.setframerate(rate)
                while same:
                    frames = src.readframes(BLOCK // SAMPLE_WIDTH)
                    if not frames:
                        break
                    dst.writeframes(frames)
    except (wave.Error, EOFError):
        _write_header(tmp, rate)
    os.replace(tmp, wav)
    return wav.stat().st_size - HEADER


def _is_ours(head: bytes, rate: int) -> bool:
    return (
        len(head) == HEADER
        and head[0:4] == b"RIFF"
        and head[8:16] == b"WAVEfmt "
        and int.from_bytes(head[16:20], "little") == 16
        and int.from_bytes(head[20:22], "little") == 1  # PCM
        and int.from_bytes(head[22:24], "little") == 1  # mono
        and int.from_bytes(head[24:28], "little") == rate
        and int.from_bytes(head[34:36], "little") == SAMPLE_WIDTH * 8
        and head[36:40] == b"data"
    )


def _write_header(path: Path, rate: int) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(SAMPLE_WIDTH)
        w.setframerate(rate)


def _read_segments(seg: Path) -> list:
    try:
        segments = json.loads(seg.read_text(encoding="utf-8"))
        return segments if isinstance(segments, list) else []
    except (FileNotFoundError, ValueError):
        return []


def _read_finals(path: Path) -> list:
    out = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    break  # the line being written when the process stopped
    except FileNotFoundError:
        pass
    return out


def _write_atomic(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


__all__ = ["PartWriter", "fold", "orphans", "recover", "discard", "wav_frames"]
