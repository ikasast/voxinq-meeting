"""Turn the downloaded public data into what the benchmarks read.

    python bench/prepare.py --reazon <dir of ReazonSpeech test parquet files> --ami <dir of AMI
        <meeting>.wav and <meeting>.rttm> [--out bench/data]

Writes:
    asr/clips/0000.wav ...   300 clips, 16 kHz mono, a fixed sample (seed below)
    asr/refs.json            the human transcription of each clip
    asr/long.wav             the same clips end to end, half a second apart: one "meeting"
    dia/<meeting>.wav        AMI's headset mix, 16 kHz mono
    dia/<meeting>.rttm       who spoke when, from the BUT diarization setup ("only words")

Needs pyarrow and ffmpeg on PATH. The data itself is not in the repository; see
docs/benchmarks.md for where it comes from and on what terms.
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
import wave
from pathlib import Path

SEED = 20261109
CLIPS = 300


def decode(data: bytes, dest: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", "pipe:0", "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", str(dest)],
        input=data,
        check=True,
    )


def prepare_asr(src: Path, out: Path) -> None:
    import pyarrow.parquet as pq

    rows: list[dict] = []
    for f in sorted(src.glob("*.parquet")):
        rows.extend(pq.read_table(f).to_pylist())
    text_key = next(k for k in rows[0] if k in ("transcription", "text", "sentence"))
    random.Random(SEED).shuffle(rows)
    rows = rows[:CLIPS]

    clips = out / "asr" / "clips"
    shutil.rmtree(clips, ignore_errors=True)
    clips.mkdir(parents=True)
    refs: dict[str, str] = {}
    for i, r in enumerate(rows):
        key = f"{i:04d}"
        decode(r["audio"]["bytes"], clips / f"{key}.wav")
        refs[key] = r[text_key]
    (out / "asr" / "refs.json").write_text(json.dumps(refs, ensure_ascii=False, indent=0), encoding="utf-8")

    silence = b"\0\0" * 8000
    seconds = 0.0
    with wave.open(str(out / "asr" / "long.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        for key in sorted(refs):
            with wave.open(str(clips / f"{key}.wav")) as c:
                n = c.getnframes()
                w.writeframes(c.readframes(n))
                seconds += n / 16000
            w.writeframes(silence)
    print(f"asr: {len(refs)} clips, {seconds / 60:.1f} minutes of speech")


def prepare_dia(src: Path, out: Path) -> None:
    dia = out / "dia"
    dia.mkdir(parents=True, exist_ok=True)
    for rttm in sorted(src.glob("*.rttm")):
        meeting = rttm.stem
        wav = src / f"{meeting}.wav"
        if not wav.exists():
            continue
        decode(wav.read_bytes(), dia / f"{meeting}.wav")
        shutil.copy(rttm, dia / rttm.name)
        print(f"dia: {meeting}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reazon", type=Path)
    ap.add_argument("--ami", type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "data")
    a = ap.parse_args()
    if a.reazon:
        prepare_asr(a.reazon, a.out)
    if a.ami:
        prepare_dia(a.ami, a.out)


if __name__ == "__main__":
    main()
