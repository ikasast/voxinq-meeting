# Notices

Voxinq Meeting is released under the [MIT License](LICENSE), © 2026 ikasast.

It is built on, and its published images carry, software and models made by others under their
own licences. This file covers the parts that need a word of their own. The complete list —
every package in each published image, with its licence — is attached to each
[GitHub release](https://github.com/ikasast/voxinq-meeting/releases): `sbom-*.json` (SPDX, as
recorded while the image was built) and `THIRD_PARTY_LICENSES.md` (the same, listed by licence).

## Included in the published images

### Speaker separation models (STT images)

Built in by `diarization/fetch_models.py`, from the [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
releases (sherpa-onnx itself is Apache-2.0):

- **Segmentation** — [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0),
  converted to ONNX. MIT License; pyannote.audio is Copyright (c) 2020 CNRS.
- **Speaker embedding** — WeSpeaker ResNet34 trained on CN-Celeb
  ([Wespeaker/wespeaker-cnceleb-resnet34-LM](https://huggingface.co/Wespeaker/wespeaker-cnceleb-resnet34-LM)).
  Apache License 2.0.

### ffmpeg and the other operating-system packages (STT images)

The CUDA image is based on Ubuntu 22.04 and the CPU image on Debian. Both include the
distribution's `ffmpeg` package, which is built with `--enable-gpl` and is therefore under the
GNU General Public License, version 2 or later. Its source — and that of every other
operating-system package in the images, at the version listed in the release's SBOM — is
published by [Ubuntu](https://launchpad.net/ubuntu) and [Debian](https://sources.debian.org/)
(`apt-get source <package>=<version>`). These are separate programs shipped alongside Voxinq,
which calls `ffmpeg` as a command.

### NVIDIA CUDA (CUDA STT image)

Built on `nvidia/cuda` with cuDNN. The CUDA and cuDNN libraries are under NVIDIA's licence
terms, which the image carries as `/NGC-DL-CONTAINER-LICENSE`.

### Icons (web image)

The icons in `app/icons.tsx` follow the design of [Lucide](https://lucide.dev), which is licensed
as follows:

> ISC License
>
> Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
> All other copyright (c) for Lucide are held by Lucide Contributors 2022.
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or
> without fee is hereby granted, provided that the above copyright notice and this permission
> notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
> SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
> AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
> NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
> OF THIS SOFTWARE.

## Downloaded on first use, not included

These are fetched by the machine that runs Voxinq, from Hugging Face or Ollama, the first time
they are needed. Their own terms apply to that machine's use of them.

- **Speech recognition** — Whisper models (MIT, OpenAI), as converted for faster-whisper and
  whisper.cpp; kotoba-whisper v2.0 for Japanese (MIT for the faster-whisper conversion,
  Apache-2.0 for the whisper.cpp one).
- **Speaker separation on an NVIDIA GPU** —
  [pyannote/speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1)
  (CC-BY-4.0) and [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
  (MIT). Both ask you to accept their conditions on Hugging Face before downloading.
- **Translation** (optional) — the model named by `STT_TRANSLATE_MODEL`; Settings →
  Transcription shows the default one and its licence.
- **Language models** (Ollama) — chosen and pulled by you; each model's licence applies. The
  default, `qwen3:8b`, is Apache-2.0.
- **Cloud services** (Anthropic, OpenAI, Groq, Google and others), when you choose them, are
  used under your own agreement with each provider.
