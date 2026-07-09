"""Speaker diarization (pyannote.audio) - diarize the whole audio in one pass after a meeting.

Runs in a dedicated venv (diarization/.venv) to keep dependencies separate from the STT
service (faster-whisper). Accuracy is a compromise given the single-mic in-person assumption.
It is a post-meeting batch job, so CPU is fine.

Usage:
    # Standalone check: split audio into speaker turns
    python diarize.py path/to/audio.wav

    # Assign speakers to STT's finalized segments (production)
    #   segments.json = [{"start": 0.0, "end": 5.4}, ...] (in STT final start/end order)
    python diarize.py path/to/audio.wav segments.json
    #   -> prints the assigned ["speaker0","speaker1",...] per segment as JSON to stdout

Environment variables:
    HF_TOKEN            HuggingFace access token (if unset, uses the saved one in ~/.cache/huggingface)
    DIA_DEVICE         cpu (default) / cuda
    DIA_NUM_SPEAKERS   fix the speaker count if known (optional)
    DIA_MIN_SPEAKERS / DIA_MAX_SPEAKERS  hints for the speaker-count range (optional)
"""

from __future__ import annotations

import json
import os
import sys

MODEL = "pyannote/speaker-diarization-3.1"


def _auth():
    # Use HF_TOKEN if set, otherwise None (= use the token saved by huggingface_hub).
    return os.environ.get("HF_TOKEN") or None


def load_pipeline():
    import torch
    from pyannote.audio import Pipeline

    # The auth argument differs by version: 3.x=use_auth_token / 4.x=token. Support both.
    try:
        pipeline = Pipeline.from_pretrained(MODEL, use_auth_token=_auth())
    except TypeError:
        pipeline = Pipeline.from_pretrained(MODEL, token=_auth())
    if pipeline is None:
        raise SystemExit(
            "Failed to load the pyannote pipeline. Check the HF token and that the model terms are accepted:\n"
            "  https://huggingface.co/pyannote/speaker-diarization-3.1\n"
            "  https://huggingface.co/pyannote/segmentation-3.0"
        )
    device = os.environ.get("DIA_DEVICE", "cpu")
    pipeline.to(torch.device(device))
    return pipeline


def diarize(audio_path: str):
    """Split audio into speaker turns. Returns [(start, end, speaker_label)]."""
    pipeline = load_pipeline()
    kwargs = {}
    if os.environ.get("DIA_NUM_SPEAKERS"):
        kwargs["num_speakers"] = int(os.environ["DIA_NUM_SPEAKERS"])
    if os.environ.get("DIA_MIN_SPEAKERS"):
        kwargs["min_speakers"] = int(os.environ["DIA_MIN_SPEAKERS"])
    if os.environ.get("DIA_MAX_SPEAKERS"):
        kwargs["max_speakers"] = int(os.environ["DIA_MAX_SPEAKERS"])

    annotation = pipeline(audio_path, **kwargs)
    # pyannote 4.x returns a DiarizeOutput. For assigning speakers to utterances, the
    # non-overlapping exclusive version is easier, so prefer it. 3.x returns an Annotation directly.
    for attr in ("exclusive_speaker_diarization", "speaker_diarization"):
        if hasattr(annotation, attr):
            annotation = getattr(annotation, attr)
            break
    turns = [
        (float(turn.start), float(turn.end), str(label))
        for turn, _, label in annotation.itertracks(yield_label=True)
    ]
    return turns


def normalize_labels(turns):
    """Renumber pyannote's "SPEAKER_00" etc. to "speaker0","speaker1"... in first-seen order."""
    order: dict[str, str] = {}
    for _s, _e, label in turns:
        if label not in order:
            order[label] = f"speaker{len(order)}"
    return order


def assign_speakers(turns, segments):
    """Assign each finalized segment (start,end) the speaker with the largest time overlap."""
    label_map = normalize_labels(turns)
    result: list[str] = []
    for seg in segments:
        s, e = float(seg["start"]), float(seg["end"])
        overlap: dict[str, float] = {}
        for ts, te, label in turns:
            ov = max(0.0, min(e, te) - max(s, ts))
            if ov > 0:
                overlap[label] = overlap.get(label, 0.0) + ov
        if overlap:
            best = max(overlap, key=overlap.get)
            result.append(label_map[best])
        else:
            result.append("speaker0")  # no overlap (e.g. silence) -> default to the first speaker
    return result


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python diarize.py <audio> [segments.json]")
        raise SystemExit(1)

    audio_path = sys.argv[1]
    turns = diarize(audio_path)

    if len(sys.argv) >= 3:
        with open(sys.argv[2], encoding="utf-8") as f:
            segments = json.load(f)
        speakers = assign_speakers(turns, segments)
        print(json.dumps({"speakers": speakers}, ensure_ascii=False))
    else:
        label_map = normalize_labels(turns)
        out = [
            {"start": round(s, 2), "end": round(e, 2), "speaker": label_map[label]}
            for s, e, label in turns
        ]
        n = len(set(label_map.values()))
        print(json.dumps({"num_speakers": n, "turns": out}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
