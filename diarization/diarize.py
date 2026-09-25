"""Speaker diarization - split a finished meeting into speaker turns, in one pass at the end.

Two backends live behind this script, and the hardware picks between them:

    CUDA present  ->  backend_pyannote   accurate, needs torch + a Hugging Face token
    otherwise     ->  backend_sherpa     ONNX only, runs anywhere, less accurate

That split is the whole point. v2.0.0-beta.1 tried to replace pyannote outright with ONNX and
shipped a regression: on a 49-minute three-person meeting the ONNX backend put every utterance
on one speaker. Rather than lose diarization on machines that have no CUDA, or lose accuracy
on machines that do, both are kept and the choice is made from what the host can run.
See docs/design-decisions.md, "Diarization: two backends, chosen by hardware".

The backends agree on a contract:

    diarize(audio_path) -> (turns, embeddings)      turns: [(start, end, raw_label)]
    embed_clip(path)    -> [float, ...]
    available()         -> (ok, reason)
    EMBEDDING_MODEL_ID, NAME

Everything downstream of that - label normalisation, mapping turns onto utterances, the JSON
on stdout - is shared and lives here.

Usage:
    # Standalone check: split audio into speaker turns
    python diarize.py path/to/audio.wav

    # Assign speakers to STT's finalized segments (production)
    #   segments.json = [{"start": 0.0, "end": 5.4, "words": [{"w","s","e"}, ...]}, ...]
    #   (in STT final start/end order; words optional)
    python diarize.py path/to/audio.wav segments.json
    #   -> prints, as JSON on stdout: the assigned ["speaker0","speaker1",...] per segment, and
    #      "pieces" — for any segment whose words show a speaker change, how it divides

    # Voice-profile enrollment: one voiceprint from a single-speaker clip
    python diarize.py --embed path/to/clip.wav

    # Which backend would run here, and what will voiceprints be stamped with?
    python diarize.py --backend-info

Environment variables:
    DIA_BACKEND         pyannote / sherpa / auto (default: auto, as described above)
    DIA_MIN_PIECE_S     absorb pieces shorter than this when splitting an utterance
                        (default 0 = keep them; a short piece is usually a real "はい")

    ...plus whatever the chosen backend reads; see backend_pyannote.py and backend_sherpa.py.
"""

from __future__ import annotations

import json
import os
import sys

BACKENDS = ("pyannote", "sherpa")


def _import(name: str):
    """Import a backend module, whether this file runs as a script or as a package member."""
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    if name == "pyannote":
        import backend_pyannote as mod
    else:
        import backend_sherpa as mod
    return mod


def select_backend():
    """The backend to use here, from DIA_BACKEND or from what the hardware can run.

    An explicit choice that cannot run is an error, not a silent downgrade: someone who set
    DIA_BACKEND=pyannote wants pyannote's accuracy, and quietly giving them the other one
    would surface much later as unexplained speaker labels.
    """
    want = (os.environ.get("DIA_BACKEND") or "auto").strip().lower()
    if want not in ("auto", *BACKENDS):
        raise SystemExit(f"DIA_BACKEND must be one of auto, {', '.join(BACKENDS)} (got {want!r})")

    if want in BACKENDS:
        mod = _import(want)
        ok, reason = mod.available()
        if not ok:
            raise SystemExit(f"DIA_BACKEND={want} was requested but cannot run: {reason}")
        return mod

    reasons = []
    pyannote = _import("pyannote")
    ok, reason = pyannote.available()
    if ok and pyannote.cuda_available():
        return pyannote
    # Only when there is a CUDA device: on CPU this backend runs at roughly real time, which
    # would turn a 60-minute meeting into a 60-minute wait without anyone having asked for it.
    reasons.append("pyannote: " + (reason or "no CUDA device"))

    sherpa = _import("sherpa")
    ok, reason = sherpa.available()
    if ok:
        return sherpa
    reasons.append(f"sherpa: {reason}")
    raise SystemExit("no diarization backend can run here - " + "; ".join(reasons))


def normalize_labels(turns):
    """Renumber raw labels to "speaker0","speaker1"... in first-seen order."""
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


def _speaker_of_word(turns, label_map, start, end):
    """The speaker of one word: the turn it shares most time with."""
    best, best_ov = None, 0.0
    for ts, te, label in turns:
        ov = max(0.0, min(end, te) - max(start, ts))
        if ov > best_ov:
            best, best_ov = label, ov
    if best is None:  # a word in a gap between turns: the nearest turn owns it
        best = min(turns, key=lambda t: min(abs(start - t[1]), abs(end - t[0])))[2]
    return label_map[best]


def absorb_short(pieces, min_seconds):
    """Merge a piece shorter than min_seconds into its longer neighbour.

    A guard against a diarizer that flickers for a fraction of a second. It is off by default:
    measured on a three-speaker meeting, absorbing hurt, because the short pieces in a live
    line are mostly real — "はい", "なるほど", a name being confirmed.
    """
    if min_seconds <= 0:
        return pieces
    pieces = [dict(p) for p in pieces]
    while len(pieces) > 1:
        short = [i for i, p in enumerate(pieces) if p["end"] - p["start"] < min_seconds]
        if not short:
            break
        i = short[0]
        length = lambda k: pieces[k]["end"] - pieces[k]["start"]  # noqa: E731
        j = i - 1 if i == len(pieces) - 1 or (i > 0 and length(i - 1) >= length(i + 1)) else i + 1
        if j < i:
            pieces[j]["text"] += pieces[i]["text"]
            pieces[j]["end"] = pieces[i]["end"]
        else:
            pieces[j]["text"] = pieces[i]["text"] + pieces[j]["text"]
            pieces[j]["start"] = pieces[i]["start"]
        del pieces[i]
        k = 0
        while k < len(pieces) - 1:  # the merge may have put two of the same speaker side by side
            if pieces[k]["speaker"] == pieces[k + 1]["speaker"]:
                pieces[k]["text"] += pieces[k + 1]["text"]
                pieces[k]["end"] = pieces[k + 1]["end"]
                del pieces[k + 1]
            else:
                k += 1
    return pieces


def split_utterances(turns, segments, min_piece_seconds=0.0):
    """Where a single utterance holds more than one speaker, say who said which part.

    An utterance is cut where the room goes quiet, never where the speaker changes, so a quick
    exchange lands in one line. The words carry their own times (kept by the STT service), so
    each word can be given to the turn it falls in and the line divided at the changes.

    Returns one entry per segment: None where the whole line is one speaker (which is most of
    them, and nothing needs doing), otherwise the pieces in order, each with the text it is
    made of. A segment with no words — an older recording, a backend that cannot align them —
    is always None, and the caller keeps using the single speaker from `assign_speakers`.
    """
    label_map = normalize_labels(turns)
    out: list[list[dict] | None] = []
    for seg in segments:
        words = seg.get("words") if isinstance(seg, dict) else None
        if not words:
            out.append(None)
            continue
        pieces: list[dict] = []
        for w in words:
            try:
                start, end, text = float(w["s"]), float(w["e"]), str(w["w"])
            except (KeyError, TypeError, ValueError):
                pieces = []
                break
            speaker = _speaker_of_word(turns, label_map, start, end)
            if pieces and pieces[-1]["speaker"] == speaker:
                pieces[-1]["text"] += text
                pieces[-1]["end"] = end
            else:
                pieces.append({"speaker": speaker, "text": text, "start": start, "end": end})
        pieces = absorb_short(pieces, min_piece_seconds)
        out.append(
            [
                {
                    "speaker": p["speaker"],
                    "text": p["text"].strip(),
                    "start": round(p["start"], 2),
                    "end": round(p["end"], 2),
                }
                for p in pieces
            ]
            if len(pieces) > 1
            else None
        )
    return out


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python diarize.py <audio> [segments.json] | --embed <audio> | --backend-info")
        raise SystemExit(1)

    if sys.argv[1] == "--backend-info":
        # What the STT service reports on /health, so the web side knows which model new
        # voiceprints carry and can mark older ones as no longer comparable.
        backend = select_backend()
        print(json.dumps({"backend": backend.NAME, "embeddingModel": backend.EMBEDDING_MODEL_ID}))
        return

    if sys.argv[1] == "--embed":
        if len(sys.argv) < 3:
            print("usage: python diarize.py --embed <audio>")
            raise SystemExit(1)
        backend = select_backend()
        try:
            vec = backend.embed_clip(sys.argv[2])
        except SystemExit:
            raise
        except Exception as e:  # noqa: BLE001  the caller shows this to a person
            print(json.dumps({"error": f"no voice embedding could be extracted: {e}"}))
            raise SystemExit(2)
        if not vec:
            print(json.dumps({"error": "no voice embedding could be extracted"}))
            raise SystemExit(2)
        print(json.dumps({"embedding": vec, "embeddingModel": backend.EMBEDDING_MODEL_ID}))
        return

    backend = select_backend()
    audio_path = sys.argv[1]
    turns, embeddings = backend.diarize(audio_path)

    if len(sys.argv) >= 3:
        with open(sys.argv[2], encoding="utf-8") as f:
            segments = json.load(f)
        speakers = assign_speakers(turns, segments)
        # And, for any utterance whose words say two people spoke in it, how it divides.
        pieces = split_utterances(turns, segments, float(os.environ.get("DIA_MIN_PIECE_S") or 0))
        # Emit embeddings keyed by the normalized labels ("speaker0", ...) so the web side can
        # enroll and match voice profiles per displayed speaker.
        label_map = normalize_labels(turns)
        norm_embeddings = {label_map[k]: v for k, v in embeddings.items() if k in label_map}
        print(
            json.dumps(
                {
                    "speakers": speakers,
                    "pieces": pieces,
                    "embeddings": norm_embeddings,
                    "embeddingModel": backend.EMBEDDING_MODEL_ID,
                },
                ensure_ascii=False,
            )
        )
    else:
        label_map = normalize_labels(turns)
        out = [
            {"start": round(s, 2), "end": round(e, 2), "speaker": label_map[label]}
            for s, e, label in turns
        ]
        n = len(set(label_map.values()))
        print(
            json.dumps(
                {"backend": backend.NAME, "num_speakers": n, "turns": out},
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
