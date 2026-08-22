"""Download the two ONNX models diarization needs.

Both are ungated — no account, no token, no terms to accept. That is a deliberate part of the
move to sherpa-onnx: the pyannote pipeline this replaced needed a Hugging Face token for a
gated model, which meant a new install worked fine until the first time someone pressed
Diarize and got an authentication error for a model they had never heard of.

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

# WeSpeaker ResNet34. Apache-2.0; the "reverb" model in the same release is non-commercial and
# is deliberately not used here.
EMBEDDING_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx"
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
