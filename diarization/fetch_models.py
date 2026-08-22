"""Download the two ONNX models the sherpa-onnx diarization backend needs.

Both are ungated - no account, no token, no terms to accept - which is why this backend is the
one that runs on a host without CUDA. The pyannote backend is more accurate and is preferred
where there is a GPU, but its pipeline is a gated model: a new install works fine until the
first time someone presses Diarize and gets an authentication error for a model they have
never heard of. See diarization/diarize.py for how the two are chosen between.

Run:  python diarization/fetch_models.py
"""

from __future__ import annotations

import io
import os
import sys
import tarfile
import urllib.request
from pathlib import Path

MODEL_DIR = Path(os.environ.get("DIA_MODEL_DIR") or (Path(__file__).parent / "models"))

# pyannote's segmentation model, converted to ONNX by the sherpa-onnx project. Segmentation
# only — the gated part of pyannote was the full diarization pipeline, not this.
SEGMENTATION_TAR = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
)
SEGMENTATION_MEMBER = "sherpa-onnx-pyannote-segmentation-3-0/model.onnx"

# WeSpeaker ResNet34 trained on **CN-Celeb**, not VoxCeleb.
#
# The English VoxCeleb build shipped first and was measurably bad at this app's actual job.
# On a 12-minute Japanese meeting where pyannote separated three people 61/38/9, it produced
# 87/20/1 — one speaker absorbing nearly everything — even when told there were exactly three.
# The CN-Celeb build of the same architecture gives 62/38/8 on the same audio: 91% agreement
# with pyannote against 40%.
#
# The reason shows up in the embeddings themselves. Measured across a real meeting, same
# speaker vs different speaker: VoxCeleb 0.84/0.60 (a margin of 0.24), CN-Celeb 0.78/0.42 (a
# margin of 0.36). A model trained on English speakers does not separate Japanese ones well
# enough for clustering to survive a long meeting.
#
# Apache-2.0. The "reverb" model in the same release is non-commercial and is not used.
EMBEDDING_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-recongition-models/wespeaker_zh_cnceleb_resnet34_LM.onnx"
)


def _download(url: str) -> bytes:
    print(f"  fetching {url.rsplit('/', 1)[-1]} ...", flush=True)
    with urllib.request.urlopen(url) as r:  # noqa: S310  fixed https URLs
        return r.read()


def main() -> int:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    seg = MODEL_DIR / "segmentation.onnx"
    if seg.exists():
        print(f"  segmentation.onnx already present ({seg.stat().st_size} bytes)")
    else:
        blob = _download(SEGMENTATION_TAR)
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:bz2") as tar:
            member = tar.extractfile(SEGMENTATION_MEMBER)
            if member is None:
                print(f"error: {SEGMENTATION_MEMBER} not found in the archive", file=sys.stderr)
                return 1
            seg.write_bytes(member.read())
        print(f"  wrote {seg} ({seg.stat().st_size} bytes)")

    emb = MODEL_DIR / "embedding.onnx"
    if emb.exists():
        print(f"  embedding.onnx already present ({emb.stat().st_size} bytes)")
    else:
        emb.write_bytes(_download(EMBEDDING_URL))
        print(f"  wrote {emb} ({emb.stat().st_size} bytes)")

    print("diarization models ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
