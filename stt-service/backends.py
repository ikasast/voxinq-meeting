"""Speech recognition backends.

Voxinq ran on faster-whisper alone, which means CTranslate2, which means CUDA or a slow CPU
path -- no Metal, no Vulkan. That is the single reason the app could not run usefully on a Mac,
so recognition is now reached through a small interface with two implementations behind it.

Be exact about what the second one buys, because it is less than it sounds: pywhispercpp's
wheels bundle Metal only on macOS arm64. The Linux and Windows wheels are CPU builds, so an AMD
or Intel GPU gets no acceleration here either -- it runs on the CPU. Hardware acceleration
means NVIDIA or Apple silicon, and nothing else. See docs/design-decisions.md.

**On a CUDA machine nothing changes.** faster-whisper stays the default there because it is
about 30% faster than whisper.cpp on that hardware; whisper.cpp is what makes everywhere else
possible, not a replacement. The choice is automatic unless STT_BACKEND says otherwise.

What a backend has to provide is small, because the parts that matter -- utterance boundaries,
partials, the hallucination filters, translation -- all live outside the model call:

    load(name) -> handle      unload(handle)
    transcribe(handle, audio, ...) -> (segments, detected_language)
    decode_audio(path) -> float32 mono @ 16 kHz
"""

from __future__ import annotations

import os
import platform
import shutil
import sys
import subprocess
from dataclasses import dataclass
from typing import Any

import numpy as np

SAMPLE_RATE = 16000


@dataclass
class Segment:
    """One recognised span. The fields the caller's filters read, and nothing else.

    no_speech_prob and avg_logprob default to values that keep a segment: a backend that
    cannot report confidence should not have everything it produces silently discarded.
    """

    text: str
    start: float = 0.0
    end: float = 0.0
    no_speech_prob: float = 0.0
    avg_logprob: float = 0.0


def cuda_available() -> bool:
    """Is there a usable CUDA device? Asked of CTranslate2, which is already a dependency."""
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:  # noqa: BLE001  no ctranslate2, no driver, or no device
        return False


def apple_silicon() -> bool:
    """Is this a Mac with Apple silicon? The one non-CUDA platform with a GPU build."""
    return sys.platform == "darwin" and platform.machine().lower() in ("arm64", "aarch64")


def live_transcription_available(backend: Any) -> bool:
    """Can this machine recognise speech while the meeting is still going on?

    Not "can it recognise" -- everything can, eventually. The question is whether it keeps up,
    because falling behind does not degrade gracefully: utterances are recognised one at a time
    in the websocket receive loop, so a machine slower than real time builds a backlog it never
    works off. Measured on a 16-core x86 CPU, the default model runs at 2.8x the length of the
    audio: an hour-long meeting leaves ~39 minutes unprocessed when someone presses stop, and
    takes another hour and a half to drain. Nothing is lost, but a stop button that does not
    return for that long is not a working feature.

    A host that cannot keep up records instead and transcribes the whole file at the end --
    same model, no live text -- though not the same weights as a CUDA host runs, see
    docs/design-decisions.md.

    The rule follows hardware acceleration, because that is what decides the answer:

        faster-whisper                  only chosen when CUDA is present   -> live
        whisper.cpp on Apple silicon    its wheel bundles Metal            -> live
        whisper.cpp anywhere else       those wheels are CPU builds        -> deferred
    """
    if backend.name == "openai-compatible":
        # A round trip per chunk, and the chunks are minutes long. This backend exists for the
        # deferred path and answers here so the app offers the right thing rather than a live
        # transcript that arrives in bursts, minutes late.
        return False
    if backend.name == "faster-whisper":
        return backend.device == "cuda"
    return apple_silicon()


def _ffmpeg_decode(path: str) -> np.ndarray:
    """Decode any audio file to float32 mono 16 kHz via ffmpeg.

    whisper.cpp has no decoder of its own -- it wants samples. ffmpeg is already required by
    the image, and is what faster-whisper's own decoder uses one layer down.
    """
    exe = shutil.which("ffmpeg")
    if not exe:
        raise RuntimeError("ffmpeg is required to read audio files but was not found on PATH")
    proc = subprocess.run(
        [
            exe, "-nostdin", "-threads", "1", "-i", path,
            "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-",
        ],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        tail = (proc.stderr or b"").decode("utf-8", "replace")[-300:]
        raise RuntimeError(f"ffmpeg could not read the audio: {tail}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


class FasterWhisperBackend:
    """CTranslate2 Whisper. Fastest on CUDA, which is why it stays the default there."""

    name = "faster-whisper"

    def __init__(self, device: str, compute: str) -> None:
        self.device = device
        self.compute = compute

    def load(self, model_name: str) -> Any:
        from faster_whisper import WhisperModel

        return WhisperModel(model_name, device=self.device, compute_type=self.compute)

    def unload(self, model: Any) -> None:
        del model  # the refcount drop frees VRAM; the API has no explicit free

    def transcribe(
        self,
        model: Any,
        audio: np.ndarray,
        *,
        language: str | None,
        initial_prompt: str | None,
        beam_size: int,
        vad_min_silence_ms: int,
        no_speech_threshold: float,
    ) -> tuple[list[Segment], str | None]:
        segments, info = model.transcribe(
            audio,
            language=language,
            initial_prompt=initial_prompt or None,
            beam_size=beam_size,
            # Boundaries come from the caller's VAD; this one suppresses the hallucinations
            # that silence *inside* a segment would otherwise produce.
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=vad_min_silence_ms),
            condition_on_previous_text=False,
            no_speech_threshold=no_speech_threshold,
        )
        out = [
            Segment(
                text=s.text,
                start=float(getattr(s, "start", 0.0) or 0.0),
                end=float(getattr(s, "end", 0.0) or 0.0),
                no_speech_prob=float(getattr(s, "no_speech_prob", 0.0) or 0.0),
                avg_logprob=float(getattr(s, "avg_logprob", 0.0) or 0.0),
            )
            for s in segments
        ]
        return out, getattr(info, "language", None)

    def decode_audio(self, path: str) -> np.ndarray:
        from faster_whisper.audio import decode_audio

        return decode_audio(path, sampling_rate=SAMPLE_RATE)


# Our model ids name CTranslate2 repositories; whisper.cpp wants ggml.
#
# pywhispercpp resolves a name only against its own built-in list (tiny...large-v3-turbo-q5_0)
# or an existing file path -- it does not fetch arbitrary Hugging Face repositories. So a model
# that only exists on the Hub is named here by repo and file, fetched, and handed over as a
# path. Passing the repo id straight through does not raise: pywhispercpp logs "Invalid model
# name", returns a Model with a null context, and the first transcribe fails on nothing.
GGML_ALIASES = {
    # Japanese-specialised, and the reason this matters: it is the model a Japanese-first app
    # would pick on a Mac. q5_0 rather than the full weights -- 1.1 GB against 3.1 GB, and
    # Kotoba's own release notes put the quality within noise of each other.
    "kotoba-tech/kotoba-whisper-v2.0-faster": (
        "kotoba-tech/kotoba-whisper-v2.0-ggml",
        "ggml-kotoba-whisper-v2.0-q5_0.bin",
    ),
}


def resolve_ggml(model_name: str) -> str:
    """A name pywhispercpp will accept: its own, or a downloaded file's path."""
    alias = GGML_ALIASES.get(model_name)
    if alias is None:
        return model_name
    repo, filename = alias
    from huggingface_hub import hf_hub_download

    return hf_hub_download(repo_id=repo, filename=filename)


class WhisperCppBackend:
    """whisper.cpp via pywhispercpp -- Metal on Apple silicon, plain CPU everywhere else.

    It takes a numpy array directly, so the streaming path hands over the buffers it already
    builds and nothing round-trips through a WAV file.
    """

    name = "whisper.cpp"

    def __init__(self, device: str) -> None:
        # ggml picks its accelerator at build time; there is no device argument to pass. This
        # is carried only so "what is it running on" stays answerable in /health.
        self.device = device
        self.compute = "ggml"

    def load(self, model_name: str) -> Any:
        from pywhispercpp.model import Model

        model = Model(
            resolve_ggml(model_name),
            print_realtime=False,
            print_progress=False,
            print_timestamps=False,
        )
        # An unresolvable name leaves the context null and is only reported through a log line,
        # so the failure would otherwise surface as an empty transcript rather than an error.
        if getattr(model, "_ctx", True) is None:
            raise RuntimeError(f"whisper.cpp could not load the model {model_name!r}")
        return model

    def unload(self, model: Any) -> None:
        del model

    def transcribe(
        self,
        model: Any,
        audio: np.ndarray,
        *,
        language: str | None,
        initial_prompt: str | None,
        beam_size: int,
        vad_min_silence_ms: int,
        no_speech_threshold: float,
    ) -> tuple[list[Segment], str | None]:
        del vad_min_silence_ms, no_speech_threshold  # whisper.cpp's VAD is a separate model
        params: dict[str, Any] = {
            "n_threads": max(1, (os.cpu_count() or 4) // 2),
            "translate": False,
            "no_context": True,  # the equivalent of condition_on_previous_text=False
        }
        if language:
            params["language"] = language
        if initial_prompt:
            params["initial_prompt"] = initial_prompt
        if beam_size and beam_size > 1:
            # Both fields, always. This maps onto whisper.cpp's beam_search struct, and the
            # binding rejects a partial dict with KeyError rather than filling in a default --
            # so omitting patience broke every finalized utterance (they all decode at
            # beam_size=5) while partials at beam_size=1 kept working, which is a hard failure
            # to read from the outside. -1.0 is whisper.cpp's own "no patience penalty".
            params["beam_search"] = {"beam_size": beam_size, "patience": -1.0}

        segments = model.transcribe(audio, **params)
        out: list[Segment] = []
        for s in segments:
            text = getattr(s, "text", "") or ""
            if not text.strip():
                continue
            # pywhispercpp reports centiseconds.
            out.append(
                Segment(
                    text=text,
                    start=float(getattr(s, "t0", 0) or 0) / 100.0,
                    end=float(getattr(s, "t1", 0) or 0) / 100.0,
                )
            )
        # The detected language sits on the model after a run, not on the segments.
        detected = None
        for attr in ("language", "detected_language"):
            value = getattr(model, attr, None)
            if isinstance(value, str) and value:
                detected = value
                break
        return out, detected or language

    def decode_audio(self, path: str) -> np.ndarray:
        return _ffmpeg_decode(path)


def _importable(module: str) -> bool:
    from importlib.util import find_spec

    try:
        return find_spec(module) is not None
    except Exception:  # noqa: BLE001  a broken install should not stop the service booting
        return False


def choose_backend(requested: str | None, device: str, compute: str | None):
    """Pick a backend, honouring STT_BACKEND and otherwise following the hardware.

    CUDA keeps faster-whisper because it is measurably quicker there; everything else gets
    whisper.cpp because CTranslate2 has no GPU path outside CUDA. A backend that is asked for
    but is not installed falls back rather than refusing to start -- an STT service that will
    not boot is worse than one running on the other engine.

    The HTTP backend is never reached by that path. It is selected only when STT_BACKEND names
    it, and never by detecting that a base URL happens to be set: sending meeting audio off the
    machine has to be something someone did on purpose, and configuring a thing is not the same
    as choosing it. See docs/design-decisions.md, "Running entirely on your own machine".
    """
    want = (requested or "").strip().lower()
    has_cuda = device == "cuda" and cuda_available()

    if want in ("openai", "openai-compatible", "cloud", "http"):
        base = (os.environ.get("STT_CLOUD_BASE_URL") or "").strip()
        if not base:
            raise SystemExit(
                "STT_BACKEND=openai needs STT_CLOUD_BASE_URL "
                "(for example https://api.groq.com/openai/v1)"
            )
        key = (os.environ.get("STT_CLOUD_API_KEY") or "").strip()
        model = (os.environ.get("STT_CLOUD_MODEL") or "whisper-large-v3-turbo").strip()
        try:
            max_mb = float(os.environ.get("STT_CLOUD_MAX_MB") or "20")
        except ValueError:
            max_mb = 20.0
        return OpenAiCompatibleBackend(base, key, model, int(max_mb * 1024 * 1024))

    if want in ("faster-whisper", "faster_whisper", "fw"):
        chosen = "faster-whisper"
    elif want in ("whisper.cpp", "whispercpp", "cpp"):
        chosen = "whisper.cpp"
    else:
        chosen = "faster-whisper" if has_cuda else "whisper.cpp"

    if chosen == "whisper.cpp" and not _importable("pywhispercpp"):
        chosen = "faster-whisper"
    elif chosen == "faster-whisper" and not _importable("faster_whisper"):
        chosen = "whisper.cpp"

    if chosen == "faster-whisper":
        # int8_float16 needs CUDA: on CPU it does not merely run slowly, it fails to load.
        resolved = compute or ("int8_float16" if has_cuda else "int8")
        return FasterWhisperBackend(device if has_cuda else "cpu", resolved)
    return WhisperCppBackend("cuda" if has_cuda else "cpu")


# --- OpenAI-compatible transcription over HTTP ------------------------------------------
#
# `POST /v1/audio/transcriptions` is the closest thing to a standard here. OpenAI defined it,
# and Groq, Fireworks, Mistral, Azure and OVHcloud implement it; OpenRouter and LiteLLM route
# on to Deepgram and AssemblyAI through the same shape. One implementation reaches all of them,
# which is why there is no per-vendor code -- and why the same setting also reaches a
# **self-hosted** whisper server on another machine you own. That last case is the point: this
# is not a cloud backend, it is an HTTP backend that a cloud happens to answer.
#
# It exists for one problem. On a machine with no CUDA and no Metal, recognition runs at about
# 2.8x the length of the audio: an hour-long meeting is a three-hour wait. A hosted
# whisper-large-v3-turbo returns the same hour in minutes. The download was never the barrier
# -- the CPU images with a cloud LLM come to under a gigabyte -- the wait was.
#
# Deliberately not live. Recognition here is a round trip per chunk, so it belongs to the
# after-the-meeting path that hosts without acceleration already use: `live_transcription_
# available` returns False for it and nothing downstream changes. Streaming would mean
# stitching sessions across the recording pipeline, which is what diarization and
# click-to-play are built on.

CLOUD_TIMEOUT_S = int(os.environ.get("STT_CLOUD_TIMEOUT", "600"))


def _wav_bytes(audio: np.ndarray) -> bytes:
    """float32 mono @16k -> a 16-bit PCM WAV in memory. What every one of these APIs accepts."""
    import io
    import wave

    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)
    return buf.getvalue()


def split_on_silence(audio: np.ndarray, max_samples: int) -> list[tuple[int, int]]:
    """Cut `audio` into spans no longer than `max_samples`, preferring quiet moments.

    Every one of these endpoints caps the upload -- OpenAI at 25 MB, which for 16 kHz mono
    16-bit is about thirteen minutes -- so an hour-long meeting *has* to be split. Splitting on
    a clock would cut words in half and lose them at both ends, so each boundary is moved to
    the quietest 100 ms in the last fifth of the span. A meeting always has pauses; if one
    somehow does not, the search still finds the least-loud window and the cut lands there.
    """
    if max_samples <= 0 or len(audio) <= max_samples:
        return [(0, len(audio))]

    win = SAMPLE_RATE // 10  # 100 ms
    spans: list[tuple[int, int]] = []
    start = 0
    while start < len(audio):
        end = start + max_samples
        if end >= len(audio):
            spans.append((start, len(audio)))
            break
        search_from = max(start + win, end - max_samples // 5)
        best_at, best_energy = end, None
        for at in range(search_from, end - win, win):
            e = float(np.mean(np.abs(audio[at : at + win])))
            if best_energy is None or e < best_energy:
                best_energy, best_at = e, at + win // 2
        spans.append((start, best_at))
        start = best_at
    return spans


class OpenAiCompatibleBackend:
    """Recognition by HTTP, against anything that speaks /v1/audio/transcriptions."""

    name = "openai-compatible"
    device = "remote"

    def __init__(self, base_url: str, api_key: str, model: str, max_bytes: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.default_model = model
        self.max_bytes = max_bytes
        # /health reports these for every backend, so they have to exist here too.
        self.compute = "http"
        # The host, never the key or the path. The settings screen names it so that "where is
        # this audio going" is answerable from the app rather than from the .env file.
        try:
            from urllib.parse import urlparse

            self.host = urlparse(self.base_url).hostname or self.base_url
        except Exception:  # noqa: BLE001  a malformed URL should not stop the service booting
            self.host = self.base_url

    # Nothing to load or free: the model is on someone else's machine. The handle is the model
    # name, so the caller's "load a different model" path keeps working unchanged.
    def load(self, model_name: str) -> Any:
        return model_name or self.default_model

    def unload(self, model: Any) -> None:
        del model

    def _post(self, wav: bytes, model: str, language: str | None, prompt: str | None) -> dict:
        """One multipart POST, built by hand to keep this service's dependencies unchanged."""
        import json
        import urllib.error
        import urllib.request
        import uuid

        boundary = "----voxinq" + uuid.uuid4().hex
        fields = {"model": model, "response_format": "verbose_json"}
        if language:
            fields["language"] = language
        if prompt:
            fields["prompt"] = prompt

        parts: list[bytes] = []
        for k, v in fields.items():
            head = "--" + boundary + "\r\n"
            head += 'Content-Disposition: form-data; name="' + k + '"\r\n\r\n'
            parts.append(head.encode() + str(v).encode() + b"\r\n")
        filehead = "--" + boundary + "\r\n"
        filehead += 'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n'
        filehead += "Content-Type: audio/wav\r\n\r\n"
        parts.append(filehead.encode())
        parts.append(wav)
        parts.append(("\r\n--" + boundary + "--\r\n").encode())
        body = b"".join(parts)

        req = urllib.request.Request(
            self.base_url + "/audio/transcriptions",
            data=body,
            headers={
                "Content-Type": "multipart/form-data; boundary=" + boundary,
                "Authorization": "Bearer " + self.api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=CLOUD_TIMEOUT_S) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # The provider's own message is the useful part: a wrong key, an unknown model and
            # an oversized file all arrive here and all read differently.
            detail = e.read().decode("utf-8", "replace")[:400]
            raise RuntimeError(
                self.base_url + " returned " + str(e.code) + ": " + detail
            ) from None
        except urllib.error.URLError as e:
            raise RuntimeError("could not reach " + self.base_url + ": " + str(e.reason)) from None

    def transcribe(
        self,
        model: Any,
        audio: np.ndarray,
        *,
        language: str | None,
        initial_prompt: str | None,
        beam_size: int,
        vad_min_silence_ms: int,
        no_speech_threshold: float,
    ) -> tuple[list[Segment], str | None]:
        # beam_size, vad_min_silence_ms and no_speech_threshold have no equivalent over HTTP.
        # Accepted and ignored rather than raising: the caller is backend-agnostic on purpose,
        # and refusing here would make it care which backend it has.
        del beam_size, vad_min_silence_ms, no_speech_threshold

        max_samples = max(SAMPLE_RATE * 10, (self.max_bytes - 4096) // 2)
        out: list[Segment] = []
        detected: str | None = None

        for begin, end in split_on_silence(audio, max_samples):
            offset = begin / float(SAMPLE_RATE)
            data = self._post(
                _wav_bytes(audio[begin:end]), str(model), language, initial_prompt or None
            )
            detected = detected or data.get("language")
            segs = data.get("segments")
            if isinstance(segs, list) and segs:
                for s in segs:
                    text = str(s.get("text") or "").strip()
                    if not text:
                        continue
                    # Confidence fields are left at their defaults, which keep a segment: these
                    # providers do not report Whisper's, and do not produce the canned
                    # silence hallucinations those filters exist for either.
                    out.append(
                        Segment(
                            text=text,
                            start=offset + float(s.get("start") or 0.0),
                            end=offset + float(s.get("end") or 0.0),
                        )
                    )
            else:
                # Some providers answer `verbose_json` with only `text`. One span for the whole
                # chunk is worse than real boundaries and better than dropping the audio.
                text = str(data.get("text") or "").strip()
                if text:
                    out.append(Segment(text=text, start=offset, end=end / float(SAMPLE_RATE)))
        return out, detected

    def decode_audio(self, path: str) -> np.ndarray:
        return _ffmpeg_decode(path)
