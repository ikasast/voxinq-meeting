"""Speaker diarization on pyannote.audio: the accurate backend, where CUDA is available.

This is what Voxinq used up to v1.5. v2.0.0-beta.1 replaced it with sherpa-onnx to shed a
CUDA torch chain and the Hugging Face token, and that turned out to cost more than it saved:
on a 49-minute three-person meeting the ONNX backend collapsed every utterance onto a single
speaker. So pyannote came back as the default wherever it can run, and sherpa-onnx stayed as
the backend for hosts that have no CUDA at all. See docs/design-decisions.md.

What it costs, and why it is not the only backend:

  * torch + torchcodec + a CUDA wheel chain -- several gigabytes of image
  * a Hugging Face token, because the pipeline is a gated model
  * on CPU it runs at roughly real time, so a 60-minute meeting takes about 60 minutes
  * MPS is not usable, so a Mac falls back to CPU

Environment variables:
    HF_TOKEN            HuggingFace access token (if unset, uses the saved one in ~/.cache/huggingface)
    DIA_DEVICE          cuda / cpu (default: cuda when torch reports a device, else cpu)
    DIA_MODEL           pipeline to use (default: the community-1 pipeline below)
    DIA_NUM_SPEAKERS    fix the speaker count if known (optional)
    DIA_MIN_SPEAKERS / DIA_MAX_SPEAKERS  hints for the speaker-count range (optional)
"""

from __future__ import annotations

import math
import os

# community-1 (pyannote.audio 4.x) segments as well as 3.1 but confuses speakers far less
# and counts them more reliably, which is what matters when mapping turns onto utterances.
# Set DIA_MODEL=pyannote/speaker-diarization-3.1 to fall back.
DEFAULT_MODEL = "pyannote/speaker-diarization-community-1"
MODEL = os.environ.get("DIA_MODEL") or DEFAULT_MODEL

# The id recorded against any voiceprint this produces. Voiceprints from the two backends are
# both 256 numbers and score 0.39 against each other on the same clip -- a different space
# wearing the same shape -- so this id is the only thing keeping them apart.
EMBEDDING_MODEL_ID = "pyannote-community-1"

NAME = "pyannote"


def _auth():
    # Use HF_TOKEN if set, otherwise None (= use the token saved by huggingface_hub).
    return os.environ.get("HF_TOKEN") or None


def cuda_available() -> bool:
    """Is there a CUDA device torch can use? False if torch is not installed at all."""
    try:
        import torch
    except ImportError:
        return False
    try:
        return bool(torch.cuda.is_available())
    except Exception:  # noqa: BLE001  a broken driver should read as "no CUDA", not crash
        return False


def available() -> tuple[bool, str]:
    """Can this backend run here? Returns (ok, reason-if-not)."""
    try:
        import pyannote.audio  # noqa: F401
    except ImportError as e:
        return False, f"pyannote.audio is not installed ({e})"
    return True, ""


def _device() -> str:
    """Where to run. CUDA when it is there, because on CPU this is roughly real time."""
    return os.environ.get("DIA_DEVICE") or ("cuda" if cuda_available() else "cpu")


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
            "Failed to load the pyannote pipeline. Check the HF token and that the model terms\n"
            f"are accepted for {MODEL}:\n"
            f"  https://huggingface.co/{MODEL}\n"
            "  (speaker-diarization-3.1 additionally requires pyannote/segmentation-3.0)"
        )
    pipeline.to(torch.device(_device()))
    return pipeline


def diarize(audio_path: str):
    """Split audio into speaker turns and extract per-speaker voice embeddings.

    Returns (turns, embeddings):
      turns:      [(start, end, raw_label)]
      embeddings: {raw_label: [float, ...]} mean speaker embedding (voiceprint) per
                  cluster, or {} if the installed pyannote version cannot provide them.
    """
    pipeline = load_pipeline()
    kwargs = {}
    if os.environ.get("DIA_NUM_SPEAKERS"):
        kwargs["num_speakers"] = int(os.environ["DIA_NUM_SPEAKERS"])
    if os.environ.get("DIA_MIN_SPEAKERS"):
        kwargs["min_speakers"] = int(os.environ["DIA_MIN_SPEAKERS"])
    if os.environ.get("DIA_MAX_SPEAKERS"):
        kwargs["max_speakers"] = int(os.environ["DIA_MAX_SPEAKERS"])

    # 3.x: pipeline(file, return_embeddings=True) returns (Annotation, centroids).
    # 4.x: ignores that kwarg and returns a DiarizeOutput with .speaker_embeddings.
    try:
        result = pipeline(audio_path, return_embeddings=True, **kwargs)
    except TypeError:
        result = pipeline(audio_path, **kwargs)

    centroids = None
    if isinstance(result, tuple) and len(result) == 2:  # 3.x
        annotation, centroids = result
        labels_source = annotation
    elif hasattr(result, "speaker_diarization"):  # 4.x DiarizeOutput
        full = result.speaker_diarization
        centroids = getattr(result, "speaker_embeddings", None)
        labels_source = full  # centroid rows are ordered by full.labels()
        # For assigning speakers to utterances, the non-overlapping exclusive version is easier.
        annotation = getattr(result, "exclusive_speaker_diarization", None) or full
    else:
        annotation = result
        labels_source = result

    turns = [
        (float(turn.start), float(turn.end), str(label))
        for turn, _, label in annotation.itertracks(yield_label=True)
    ]

    embeddings: dict[str, list[float]] = {}
    if centroids is not None:
        for i, label in enumerate(labels_source.labels()):
            if i >= len(centroids):
                break
            vec = [float(x) for x in centroids[i]]
            # Skip padded/degenerate rows (all-zero or non-finite).
            if not vec or any(not math.isfinite(x) for x in vec) or all(x == 0.0 for x in vec):
                continue
            embeddings[str(label)] = vec
    return turns, embeddings


def embed_clip(audio_path: str) -> list[float]:
    """One voiceprint from a clip that is assumed to hold a single speaker."""
    os.environ["DIA_NUM_SPEAKERS"] = "1"
    _turns, embeddings = diarize(audio_path)
    return next(iter(embeddings.values()), [])
