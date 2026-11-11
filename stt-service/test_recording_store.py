"""A session's audio on disk as it arrives, and folded into the meeting's WAV.

Run with: python -m pytest stt-service/test_recording_store.py   (or plain `python test_recording_store.py`)

Standard library only. The audio is bytes counted out by hand, so every check is on exact sample
positions: what a meeting split across sessions, or a process killed in the middle of one, leaves
in the file the web app plays and speaker separation reads.
"""

from __future__ import annotations

import json
import sys
import tempfile
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import recording_store as rs  # noqa: E402

RATE = 16000


def _pcm(n: int, value: int) -> bytes:
    """n samples of one value, so where each session's audio lands can be read back."""
    return value.to_bytes(2, "little", signed=True) * n


def _frames(folder: Path, mid: str) -> bytes:
    with wave.open(str(folder / f"{mid}.wav"), "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
        return w.readframes(w.getnframes())


def _segments(folder: Path, mid: str) -> list:
    return json.loads((folder / f"{mid}.segments.json").read_text(encoding="utf-8"))


def _session(folder: Path, mid: str, chunks: list[bytes], finals: list[dict]) -> rs.PartWriter:
    part = rs.PartWriter(folder, mid)
    for c in chunks:
        part.write(c)
    for f in finals:
        part.add_final(f)
    return part


def _leftovers(folder: Path) -> list[str]:
    return sorted(p.name for p in folder.iterdir() if ".part" in p.name or p.name.endswith(".tmp"))


def test_a_session_becomes_the_recording() -> None:
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        part = _session(folder, "m1", [_pcm(100, 1), _pcm(50, 2)], [{"start": 0.0, "end": 0.005}])
        assert part.samples == 150
        part.fold(RATE)
        assert _frames(folder, "m1") == _pcm(100, 1) + _pcm(50, 2)
        assert _segments(folder, "m1") == [{"start": 0.0, "end": 0.005}]
        assert _leftovers(folder) == []


def test_the_audio_is_on_disk_before_the_session_ends() -> None:
    # The whole point: a killed process leaves what it was sent.
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        part = _session(folder, "m1", [_pcm(80, 3)], [{"start": 0.0, "end": 0.004}])
        on_disk = (folder / f"{part.stem}.pcm").read_bytes()
        assert on_disk == _pcm(80, 3)
        assert (folder / f"{part.stem}.jsonl").read_text(encoding="utf-8").strip()
        part.abandon()


def test_a_resumed_meeting_appends() -> None:
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        _session(folder, "m1", [_pcm(32, 1)], [{"start": 0.0, "end": 0.002}]).fold(RATE)
        _session(folder, "m1", [_pcm(64, 2)], [{"start": 0.002, "end": 0.006}]).fold(RATE)
        assert _frames(folder, "m1") == _pcm(32, 1) + _pcm(64, 2)
        assert [s["start"] for s in _segments(folder, "m1")] == [0.0, 0.002]


def test_a_killed_session_is_recovered() -> None:
    # The production loss: a false start saved, then a long session never written.
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        _session(folder, "m1", [_pcm(32, 1)], [{"start": 0.0, "end": 0.002}]).fold(RATE)
        long = _session(folder, "m1", [_pcm(500, 2)] * 4, [{"start": 0.002, "end": 0.1}])
        long.abandon()  # the process died: nothing folded it, nothing owns it
        assert rs.orphans(folder, "m1") == [("m1", long.stem)]
        assert rs.recover(folder, RATE) == ["m1"]
        assert _frames(folder, "m1") == _pcm(32, 1) + _pcm(500, 2) * 4
        assert len(_segments(folder, "m1")) == 2
        assert _leftovers(folder) == []


def test_a_line_cut_off_mid_write_is_dropped() -> None:
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        part = _session(folder, "m1", [_pcm(10, 1)], [{"start": 0.0, "end": 0.001}])
        part.abandon()
        with open(folder / f"{part.stem}.jsonl", "a", encoding="utf-8") as f:
            f.write('{"start": 0.0')
        with open(folder / f"{part.stem}.pcm", "ab") as f:
            f.write(b"\x07")  # half a sample
        rs.recover(folder, RATE)
        assert _frames(folder, "m1") == _pcm(10, 1)
        assert _segments(folder, "m1") == [{"start": 0.0, "end": 0.001}]


def test_a_fold_cut_short_is_not_appended_twice() -> None:
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        _session(folder, "m1", [_pcm(20, 1)], [{"start": 0.0, "end": 0.001}]).fold(RATE)
        part = _session(folder, "m1", [_pcm(30, 2)], [{"start": 0.001, "end": 0.003}])
        real = rs._read_finals

        def dies(_path: Path) -> list:
            raise OSError("killed after the audio was appended")

        rs._read_finals = dies
        try:
            part.fold(RATE)
            raise AssertionError("the fold should have stopped")
        except OSError:
            pass
        finally:
            rs._read_finals = real
        # The audio went in; the boundaries did not; the part is still there to do again.
        assert _frames(folder, "m1") == _pcm(20, 1) + _pcm(30, 2)
        assert rs.orphans(folder, "m1") == [("m1", part.stem)]
        rs.recover(folder, RATE)
        assert _frames(folder, "m1") == _pcm(20, 1) + _pcm(30, 2)
        assert [s["start"] for s in _segments(folder, "m1")] == [0.0, 0.001]
        assert _leftovers(folder) == []


def test_a_half_written_tail_is_cut_before_appending() -> None:
    # A fold killed mid-copy leaves bytes past what the header declares.
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        _session(folder, "m1", [_pcm(20, 1)], []).fold(RATE)
        with open(folder / "m1.wav", "ab") as f:
            f.write(_pcm(7, 9))
        _session(folder, "m1", [_pcm(5, 2)], []).fold(RATE)
        assert _frames(folder, "m1") == _pcm(20, 1) + _pcm(5, 2)


def test_live_sessions_are_not_orphans_and_orphans_fold_oldest_first() -> None:
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        first = _session(folder, "m1", [_pcm(4, 1)], [])
        second = _session(folder, "m1", [_pcm(4, 2)], [])
        live = _session(folder, "m2", [_pcm(4, 3)], [])
        first.abandon()
        second.abandon()
        assert [stem for _m, stem in rs.orphans(folder)] == [first.stem, second.stem]
        rs.recover(folder, RATE)
        assert _frames(folder, "m1") == _pcm(4, 1) + _pcm(4, 2)
        assert not (folder / "m2.wav").exists()
        live.fold(RATE)
        assert _frames(folder, "m2") == _pcm(4, 3)


def test_a_recording_at_another_rate_is_replaced() -> None:
    # The session clock already counted it as nothing (`_existing_recording_samples`).
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        with wave.open(str(folder / "m1.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(8000)
            w.writeframes(_pcm(40, 5))
        _session(folder, "m1", [_pcm(10, 1)], []).fold(RATE)
        assert _frames(folder, "m1") == _pcm(10, 1)


def test_a_recording_with_another_header_layout_is_kept() -> None:
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        audio = _pcm(12, 4)
        fmt = (1).to_bytes(2, "little") + (1).to_bytes(2, "little") + RATE.to_bytes(4, "little")
        fmt += (RATE * 2).to_bytes(4, "little") + (2).to_bytes(2, "little") + (16).to_bytes(2, "little")
        info = b"LIST" + (4).to_bytes(4, "little") + b"INFO"
        body = b"WAVE" + b"fmt " + (16).to_bytes(4, "little") + fmt + info
        body += b"data" + len(audio).to_bytes(4, "little") + audio
        (folder / "m1.wav").write_bytes(b"RIFF" + len(body).to_bytes(4, "little") + body)
        _session(folder, "m1", [_pcm(3, 1)], []).fold(RATE)
        assert _frames(folder, "m1") == audio + _pcm(3, 1)


def test_deleting_a_recording_takes_its_orphans() -> None:
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        gone = _session(folder, "m1", [_pcm(4, 1)], [])
        gone.abandon()
        live = _session(folder, "m1", [_pcm(4, 2)], [])
        rs.discard(folder, "m1")
        assert not (folder / f"{gone.stem}.pcm").exists()
        assert (folder / f"{live.stem}.pcm").exists()
        live.abandon()


def test_an_empty_session_leaves_an_empty_recording() -> None:
    # Connected and ended without audio: the WAV is valid, and holds nothing.
    with tempfile.TemporaryDirectory() as d:
        folder = Path(d)
        _session(folder, "m1", [], []).fold(RATE)
        assert _frames(folder, "m1") == b""
        assert rs.wav_frames(folder / "m1.wav") == 0


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
