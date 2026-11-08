"""Recognition, through the transcription service's own code, on the prepared public clips.

    python bench/asr.py --backend faster-whisper|whisper.cpp [--model large-v3-turbo]
        [--runs 3] [--data bench/data] [--out bench/results/asr-<backend>.json]

Two passes, the two ways a meeting is recognised:

  clips  each clip on its own, the way a live line is (transcribe_segment_ex: the settings and
         the silence filters the recording screen gets).
  long   the clips joined into one file, the way a meeting is recognised after it ends or
         re-transcribed (the same call and filters as the service's re-transcription job).
         Run --runs times, so the difference between runs of the same audio can be measured.

It imports stt-service/server.py rather than copying its settings, so what is measured is what
ships. Nothing is started: no web server, no socket. Run it with the service's own Python
(stt-service/.venv), from the repository root.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def read(path: Path) -> np.ndarray:
    with wave.open(str(path)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", required=True, choices=["faster-whisper", "whisper.cpp"])
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--language", default="ja")
    ap.add_argument("--data", type=Path, default=ROOT / "bench" / "data")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--skip-clips", action="store_true")
    a = ap.parse_args()

    # Read by server.py at import. No preload, no live session, recordings nowhere that matters.
    os.environ["STT_BACKEND"] = a.backend
    os.environ.setdefault("WHISPER_DEVICE", "cuda" if a.backend == "faster-whisper" else "cpu")
    os.environ["STT_PRELOAD"] = "0"
    os.environ.setdefault("STT_RECORDINGS_DIR", str(a.data / "recordings"))
    sys.path.insert(0, str(ROOT / "stt-service"))
    import server  # noqa: E402

    out = a.out or ROOT / "bench" / "results" / f"asr-{a.backend}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    clips = sorted((a.data / "asr" / "clips").glob("*.wav"))

    t0 = time.perf_counter()
    model = server.whisper.get(a.model)
    load_s = time.perf_counter() - t0
    result: dict = {
        "backend": server.backend.name,
        "device": server.backend.device,
        "compute": server.backend.compute,
        "model": a.model,
        "language": a.language,
        "load_seconds": round(load_s, 1),
    }
    print(f"{result['backend']} on {result['device']} ({result['compute']}), {a.model} loaded in {load_s:.1f} s", flush=True)

    if not a.skip_clips:
        hyps: dict[str, str] = {}
        audio_s = 0.0
        t0 = time.perf_counter()
        for p in clips:
            audio = read(p)
            audio_s += audio.size / 16000
            text, _lang, _words = server.transcribe_segment_ex(model, audio, a.language)
            hyps[p.stem] = text
        took = time.perf_counter() - t0
        result["clips"] = {"hyps": hyps, "audio_seconds": round(audio_s, 1), "seconds": round(took, 1)}
        print(f"clips: {len(hyps)} in {took:.0f} s, RTF {took / audio_s:.3f}", flush=True)

    long_audio = read(a.data / "asr" / "long.wav")
    runs = []
    for i in range(a.runs):
        t0 = time.perf_counter()
        segments, _detected = server.backend.transcribe(
            model,
            long_audio,
            language=a.language,
            initial_prompt=server._effective_prompt(a.model, None) or None,
            beam_size=5,
            vad_min_silence_ms=500,
            no_speech_threshold=server.STT_NO_SPEECH_THRESH,
            word_timestamps=True,
        )
        lines = []
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            if seg.no_speech_prob >= server.STT_NO_SPEECH_THRESH and seg.avg_logprob <= server.STT_LOGPROB_THRESH:
                continue
            if server._normalize(text) in server.HALLUCINATION_PHRASES:
                continue
            lines.append(text)
        took = time.perf_counter() - t0
        runs.append({"text": "".join(lines), "lines": len(lines), "seconds": round(took, 1)})
        print(f"long run {i + 1}: {len(lines)} lines in {took:.0f} s, RTF {took / (long_audio.size / 16000):.3f}", flush=True)
    result["long"] = {"audio_seconds": round(long_audio.size / 16000, 1), "runs": runs}

    out.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
