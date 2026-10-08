"""Emotion of each line, from the voice: neutral, joy, anger or sadness.

For the Emotion extension. Run as a separate process — like diarization, by the Python that has
torch — so the model's memory is handed back the moment it is done:

    python emotion.py <recording.wav> <spans.json>      prints {"lines": [...]} on stdout

spans.json is [{"start": s, "end": s}, ...]; each line answers {"probs": [neutral, joy, anger,
sadness]}, or null for one too short to judge.

The model is kushinada-hubert-large-jtes-er (Apache-2.0), from the National Institute of Advanced
Industrial Science and Technology: HuBERT large trained on Japanese broadcast speech, with a small
head trained on JTES, a corpus of read emotional speech. The five published heads (one per
cross-validation fold) are averaged. Both repositories are gated on Hugging Face: accepting their
terms once is what lets HF_TOKEN fetch them.

Read speech is not a meeting. What this says is a hint about how a line sounded, not a reading of
anybody's feelings — which is how the app presents it.

HuBERT is written out here in plain torch rather than taken from `transformers`: the weights are
the transformers ones and the arithmetic is the same, and it spares the image a large dependency
whose own dependencies move often. Checked against transformers' HubertModel on real speech: the
input to every layer agrees to within 1e-3. The last state is taken after the encoder's final
layer norm, as s3prl took it when the heads were trained (fairseq's encoder output) — transformers
5 reports that one before the norm, so the two differ there by design.
"""

from __future__ import annotations

import json
import math
import os
import sys
import wave
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

BASE_REPO = "imprt/kushinada-hubert-large"
HEAD_REPO = "imprt/kushinada-hubert-large-jtes-er"
HEAD_FILES = [
    f"s3prl/result/downstream/kushinada-hubert-large-jtes-er_fold{i}/dev-best.ckpt" for i in range(1, 6)
]
LABELS = ["neutral", "joy", "anger", "sadness"]
RATE = 16000
MIN_S = 0.5  # shorter than this and there is too little voice to say anything
MAX_S = 30.0  # longer is judged on its first half-minute: attention grows with the square

CONV_KERNEL = [10, 3, 3, 3, 3, 2, 2]
CONV_STRIDE = [5, 2, 2, 2, 2, 2, 2]
HEADS = 16
LN_EPS = 1e-5


def _fetch() -> tuple[dict, list[dict]]:
    """The base model's weights and the five heads, from the Hugging Face cache or the hub."""
    from huggingface_hub import hf_hub_download

    token = os.environ.get("HF_TOKEN") or None
    base = torch.load(
        hf_hub_download(BASE_REPO, "pytorch_model.bin", token=token), map_location="cpu", weights_only=True
    )
    heads = []
    for name in HEAD_FILES:
        ck = torch.load(hf_hub_download(HEAD_REPO, name, token=token), map_location="cpu", weights_only=False)
        d = ck["Downstream"]
        heads.append(
            {
                "mix": torch.softmax(ck["Featurizer"]["weights"].float(), 0),
                "proj_w": d["projector.weight"].float(),
                "proj_b": d["projector.bias"].float(),
                "out_w": d["model.post_net.linear.weight"].float(),
                "out_b": d["model.post_net.linear.bias"].float(),
            }
        )
    return base, heads


class Hubert:
    """HuBERT large with the stable layer norm, forward only, from transformers' weight names."""

    def __init__(self, w: dict, device: torch.device):
        self.w = {k: v.float().to(device) for k, v in w.items()}
        # Weight normalisation over the kernel positions, folded into a plain weight.
        g = self.w["encoder.pos_conv_embed.conv.weight_g"]
        v = self.w["encoder.pos_conv_embed.conv.weight_v"]
        self.pos_w = v * (g / v.norm(dim=(0, 1), keepdim=True))
        self.layers = sum(1 for k in self.w if k.endswith(".final_layer_norm.weight"))

    def _ln(self, x, prefix):
        return F.layer_norm(x, x.shape[-1:], self.w[prefix + ".weight"], self.w[prefix + ".bias"], LN_EPS)

    def _lin(self, x, prefix):
        return F.linear(x, self.w[prefix + ".weight"], self.w[prefix + ".bias"])

    @torch.no_grad()
    def hidden_states(self, wav: torch.Tensor) -> list[torch.Tensor]:
        """wav: (samples,) normalised. Returns the input to every layer and the normalised output."""
        x = wav[None, None, :]
        for i, (k, s) in enumerate(zip(CONV_KERNEL, CONV_STRIDE)):
            p = f"feature_extractor.conv_layers.{i}"
            x = F.conv1d(x, self.w[p + ".conv.weight"], self.w[p + ".conv.bias"], stride=s)
            x = F.gelu(self._ln(x.transpose(1, 2), p + ".layer_norm").transpose(1, 2))
        h = self._ln(x.transpose(1, 2), "feature_projection.layer_norm")
        h = self._lin(h, "feature_projection.projection")  # (1, T, 1024)

        pos = F.conv1d(
            h.transpose(1, 2), self.pos_w, self.w["encoder.pos_conv_embed.conv.bias"], padding=64, groups=16
        )
        pos = F.gelu(pos[:, :, :-1]).transpose(1, 2)  # an even kernel pads one frame too many
        h = h + pos

        states = []
        n, d = h.shape[1], h.shape[2]
        hd = d // HEADS
        for i in range(self.layers):
            states.append(h)
            p = f"encoder.layers.{i}"
            a = self._ln(h, p + ".layer_norm")
            q = self._lin(a, p + ".attention.q_proj").view(1, n, HEADS, hd).transpose(1, 2)
            k = self._lin(a, p + ".attention.k_proj").view(1, n, HEADS, hd).transpose(1, 2)
            v = self._lin(a, p + ".attention.v_proj").view(1, n, HEADS, hd).transpose(1, 2)
            att = torch.softmax((q @ k.transpose(-1, -2)) / math.sqrt(hd), dim=-1) @ v
            h = h + self._lin(att.transpose(1, 2).reshape(1, n, d), p + ".attention.out_proj")
            f = self._ln(h, p + ".final_layer_norm")
            f = self._lin(F.gelu(self._lin(f, p + ".feed_forward.intermediate_dense")), p + ".feed_forward.output_dense")
            h = h + f
        states.append(self._ln(h, "encoder.layer_norm"))
        return [s[0] for s in states]  # each (T, 1024)


def classify(model: Hubert, heads: list[dict], x: np.ndarray, device: torch.device) -> list[float] | None:
    if len(x) < MIN_S * RATE:
        return None
    x = x[: int(MAX_S * RATE)]
    x = (x - x.mean()) / (x.std() + 1e-7)  # the feature extractor's do_normalize
    states = torch.stack(model.hidden_states(torch.from_numpy(x).float().to(device)))  # (25, T, 1024)
    probs = []
    for h in heads:
        mixed = (h["mix"].to(device)[:, None, None] * states).sum(0)
        pooled = F.linear(mixed, h["proj_w"].to(device), h["proj_b"].to(device)).mean(0)
        probs.append(torch.softmax(F.linear(pooled, h["out_w"].to(device), h["out_b"].to(device)), -1))
    return [round(float(p), 4) for p in torch.stack(probs).mean(0).cpu()]


def read_lines(wav_path: Path, spans: list[dict]) -> list[np.ndarray | None]:
    out: list[np.ndarray | None] = []
    with wave.open(str(wav_path), "rb") as w:
        if w.getframerate() != RATE or w.getsampwidth() != 2:
            raise ValueError("expected 16 kHz, 16-bit PCM")
        channels, total = w.getnchannels(), w.getnframes()
        for s in spans:
            try:
                start, end = float(s["start"]), float(s["end"])
            except (KeyError, TypeError, ValueError):
                out.append(None)
                continue
            first, last = max(0, int(start * RATE)), min(total, int(end * RATE))
            if last <= first:
                out.append(None)
                continue
            w.setpos(first)
            x = np.frombuffer(w.readframes(last - first), dtype="<i2").astype(np.float32) / 32768.0
            out.append(x.reshape(-1, channels).mean(axis=1) if channels > 1 else x)
    return out


def main(argv: list[str]) -> int:
    wav_path, spans_path = Path(argv[1]), Path(argv[2])
    spans = json.loads(spans_path.read_text(encoding="utf-8"))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    base, heads = _fetch()
    model = Hubert(base, device)
    del base
    lines = []
    for x in read_lines(wav_path, spans):
        probs = classify(model, heads, x, device) if x is not None else None
        lines.append({"probs": probs} if probs else None)
    print(json.dumps({"lines": lines, "labels": LABELS, "device": device.type}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
