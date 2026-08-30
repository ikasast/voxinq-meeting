"""Backend selection, which is the part that decides what a machine actually runs.

Run with: python -m pytest stt-service/test_backends.py   (or plain `python test_backends.py`)

Mostly this is about the rules: which backend a machine picks, and the promise that a CUDA
host keeps behaving exactly as it did before backends existed. faster-whisper inference needs
a GPU and several gigabytes, so it stays untested here -- but whisper.cpp runs on any CPU with
a 75 MB model, and one real decode is included at the bottom, because a bug hid in the gap
between "the rules are right" and "the call works".
"""

from __future__ import annotations

import contextlib
import email
import http.server
import json
import os
import sys
import threading
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))

import backends  # noqa: E402


class _Chooser:
    """Pin down what is installed and whether CUDA is present, so the test is about the rules."""

    def __init__(self, monkey_cuda: bool, installed: set[str]) -> None:
        self.cuda = monkey_cuda
        self.installed = installed
        self._orig_cuda = backends.cuda_available
        self._orig_import = backends._importable

    def __enter__(self):
        backends.cuda_available = lambda: self.cuda
        backends._importable = lambda m: m in self.installed
        return self

    def __exit__(self, *_exc) -> None:
        backends.cuda_available = self._orig_cuda
        backends._importable = self._orig_import


BOTH = {"faster_whisper", "pywhispercpp"}


def test_cuda_host_is_unchanged() -> None:
    # The promise of this change: a CUDA machine keeps faster-whisper and its CUDA compute type.
    with _Chooser(True, BOTH):
        b = backends.choose_backend(None, "cuda", None)
    assert b.name == "faster-whisper"
    assert b.device == "cuda"
    assert b.compute == "int8_float16"


def test_without_cuda_it_picks_whisper_cpp() -> None:
    with _Chooser(False, BOTH):
        b = backends.choose_backend(None, "cuda", None)  # asked for cuda, hardware says no
    assert b.name == "whisper.cpp"
    assert b.device == "cpu"


def test_cpu_faster_whisper_does_not_get_a_cuda_compute_type() -> None:
    # int8_float16 does not merely run slowly on CPU, it fails to load.
    with _Chooser(False, {"faster_whisper"}):
        b = backends.choose_backend("faster-whisper", "cpu", None)
    assert b.compute == "int8"


def test_an_explicit_choice_wins() -> None:
    with _Chooser(True, BOTH):
        assert backends.choose_backend("whispercpp", "cuda", None).name == "whisper.cpp"
        assert backends.choose_backend("faster-whisper", "cpu", None).name == "faster-whisper"


def test_an_uninstalled_backend_falls_back_rather_than_failing_to_boot() -> None:
    # A service that will not start is worse than one running on the other engine.
    with _Chooser(False, {"faster_whisper"}):
        assert backends.choose_backend("whispercpp", "cpu", None).name == "faster-whisper"
    with _Chooser(True, {"pywhispercpp"}):
        assert backends.choose_backend("faster-whisper", "cuda", None).name == "whisper.cpp"


def test_explicit_compute_is_respected() -> None:
    with _Chooser(True, BOTH):
        assert backends.choose_backend(None, "cuda", "float16").compute == "float16"


def test_segment_defaults_keep_the_segment() -> None:
    # A backend that reports no confidence must not have its output discarded by the filter,
    # which drops only when no_speech_prob is high AND avg_logprob is low.
    s = backends.Segment(text="hello")
    assert not (s.no_speech_prob >= 0.6 and s.avg_logprob <= -1.0)


def test_ggml_alias_names_a_repo_and_a_file() -> None:
    # Not just a repo id: pywhispercpp resolves its own built-in names or a file path, and
    # nothing else. An alias that stops at the repo silently loads no model at all.
    repo, filename = backends.GGML_ALIASES["kotoba-tech/kotoba-whisper-v2.0-faster"]
    assert repo == "kotoba-tech/kotoba-whisper-v2.0-ggml"
    assert filename.endswith(".bin")


def test_a_builtin_ggml_name_is_passed_through_untouched() -> None:
    # Downloading is only for the aliased models; everything else pywhispercpp fetches itself.
    assert backends.resolve_ggml("large-v3-turbo-q5_0") == "large-v3-turbo-q5_0"


class _Platform:
    """Pretend to be a given OS/CPU, so the Mac branch is testable from anywhere."""

    def __init__(self, plat: str, machine: str) -> None:
        self.plat, self.machine = plat, machine
        self._orig = (backends.sys.platform, backends.platform.machine)

    def __enter__(self):
        backends.sys.platform = self.plat
        backends.platform.machine = lambda: self.machine
        return self

    def __exit__(self, *_exc) -> None:
        backends.sys.platform, backends.platform.machine = self._orig


def test_a_cuda_host_transcribes_live() -> None:
    with _Chooser(True, BOTH):
        b = backends.choose_backend(None, "cuda", None)
    assert backends.live_transcription_available(b) is True


def test_apple_silicon_transcribes_live() -> None:
    # Its wheel is the one that bundles Metal.
    with _Chooser(False, BOTH), _Platform("darwin", "arm64"):
        b = backends.choose_backend(None, "cuda", None)
        assert b.name == "whisper.cpp"
        assert backends.live_transcription_available(b) is True


def test_a_plain_cpu_host_defers() -> None:
    # The measured case: 2.8x realtime, so live recognition would fall behind and stay behind.
    with _Chooser(False, BOTH), _Platform("linux", "x86_64"):
        b = backends.choose_backend(None, "cuda", None)
        assert backends.live_transcription_available(b) is False


def test_an_intel_mac_defers() -> None:
    # darwin alone is not the condition -- Metal here is a build for arm64 wheels.
    with _Chooser(False, BOTH), _Platform("darwin", "x86_64"):
        b = backends.choose_backend(None, "cuda", None)
        assert backends.live_transcription_available(b) is False


def test_faster_whisper_on_cpu_defers() -> None:
    # Forced onto faster-whisper without a GPU: still slower than speech.
    with _Chooser(False, {"faster_whisper"}):
        b = backends.choose_backend("faster-whisper", "cpu", None)
    assert backends.live_transcription_available(b) is False


def test_whisper_cpp_actually_decodes_at_the_beam_size_finals_use() -> None:
    """Run a real decode through the whisper.cpp backend, or skip.

    This is here because everything above tests the rules and nothing tested the path, and a
    bug lived in that gap: the beam_search parameter was sent as {"beam_size": n} without
    "patience", which the binding rejects with KeyError instead of defaulting. Partials decode
    at beam_size=1 and never touch it, so live text kept appearing while *every finalized
    utterance* failed -- on exactly the machines that have no CUDA and no other backend.

    A second of silence is enough: the assertion is that the call returns, not what it heard.
    """
    try:
        import numpy as np
        from pywhispercpp.model import Model  # noqa: F401
    except ImportError as e:
        print(f"  skip whisper.cpp decode ({e})")
        return

    backend = backends.WhisperCppBackend("cpu")
    try:
        model = backend.load("tiny")
    except Exception as e:  # noqa: BLE001  no network in some environments
        print(f"  skip whisper.cpp decode (model unavailable: {e})")
        return

    for beam_size in (1, 5):
        segments, _lang = backend.transcribe(
            model,
            np.zeros(16000, dtype=np.float32),
            language="ja",
            initial_prompt=None,
            beam_size=beam_size,
            vad_min_silence_ms=500,
            no_speech_threshold=0.6,
        )
        assert isinstance(segments, list), f"beam_size={beam_size} did not return segments"
    backend.unload(model)


# --- The HTTP backend -------------------------------------------------------------------
#
# Two things here are hand-written and therefore worth testing: the multipart body, because
# nothing else in this service builds one, and the chunking, because an endpoint that caps the
# upload makes it mandatory rather than an optimisation. A local HTTP server stands in for the
# provider so the round trip is exercised for real, without a key or a network.


def test_short_audio_is_not_split() -> None:
    audio = np.zeros(backends.SAMPLE_RATE * 5, dtype=np.float32)
    assert backends.split_on_silence(audio, backends.SAMPLE_RATE * 60) == [(0, len(audio))]


def test_long_audio_is_split_into_spans_within_the_cap() -> None:
    audio = np.float32(np.random.RandomState(0).uniform(-0.5, 0.5, backends.SAMPLE_RATE * 300))
    cap = backends.SAMPLE_RATE * 60
    spans = backends.split_on_silence(audio, cap)
    assert len(spans) >= 5
    assert all(end - start <= cap for start, end in spans)
    # Contiguous and complete: no audio is dropped between chunks, and none is sent twice.
    assert spans[0][0] == 0 and spans[-1][1] == len(audio)
    assert all(spans[i][1] == spans[i + 1][0] for i in range(len(spans) - 1))


def test_the_cut_lands_in_the_quiet_part() -> None:
    """The whole point of splitting on silence rather than on a clock."""
    sr = backends.SAMPLE_RATE
    audio = np.float32(np.random.RandomState(1).uniform(-0.5, 0.5, sr * 100))
    # A two-second gap at 55s, inside the search window for a 60s cap.
    audio[sr * 55 : sr * 57] = 0.0
    spans = backends.split_on_silence(audio, sr * 60)
    cut = spans[0][1] / sr
    assert 55.0 <= cut <= 57.0, f"cut at {cut}s, expected inside the silence"


class _FakeProvider(http.server.BaseHTTPRequestHandler):
    """Enough of /v1/audio/transcriptions to check what we sent and what we do with a reply."""

    received: dict = {}

    def do_POST(self) -> None:  # noqa: N802  the base class names it
        body = self.rfile.read(int(self.headers["Content-Length"]))
        _FakeProvider.received = {
            "path": self.path,
            "auth": self.headers.get("Authorization"),
            "content_type": self.headers.get("Content-Type"),
            "body": body,
        }
        payload = json.dumps(
            {
                "language": "ja",
                "segments": [
                    {"start": 0.5, "end": 1.5, "text": " hello "},
                    {"start": 2.0, "end": 3.0, "text": ""},
                    {"start": 3.0, "end": 4.0, "text": "world"},
                ],
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args) -> None:  # keep the test output clean
        pass


@contextlib.contextmanager
def _provider(handler=_FakeProvider):
    server = http.server.HTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/v1"
    finally:
        server.shutdown()


def _backend(base: str, max_bytes: int = 20 * 1024 * 1024):
    return backends.OpenAiCompatibleBackend(base, "test-key", "whisper-large-v3-turbo", max_bytes)


def test_it_sends_a_multipart_body_the_provider_can_read() -> None:
    with _provider() as base:
        b = _backend(base)
        segs, lang = b.transcribe(
            b.load(""),
            np.zeros(backends.SAMPLE_RATE, dtype=np.float32),
            language="ja",
            initial_prompt="Voxinq",
            beam_size=5,
            vad_min_silence_ms=500,
            no_speech_threshold=0.6,
        )

    got = _FakeProvider.received
    assert got["path"] == "/v1/audio/transcriptions"
    assert got["auth"] == "Bearer test-key"

    # Parse it the way a server would, rather than asserting on the bytes we wrote.
    ctype = got["content_type"]
    msg = email.message_from_bytes(
        b"Content-Type: " + ctype.encode() + b"\r\nMIME-Version: 1.0\r\n\r\n" + got["body"]
    )
    parts = {
        p.get_param("name", header="content-disposition"): p.get_payload(decode=True)
        for p in msg.get_payload()
    }
    assert parts["model"] == b"whisper-large-v3-turbo"
    assert parts["language"] == b"ja"
    assert parts["prompt"] == b"Voxinq"
    assert parts["response_format"] == b"verbose_json"
    assert parts["file"].startswith(b"RIFF") and b"WAVE" in parts["file"][:16]

    assert lang == "ja"
    assert [s.text for s in segs] == ["hello", "world"]  # the empty one is dropped


def test_timestamps_are_offset_by_the_chunk_they_came_from() -> None:
    """Each chunk's clock starts at zero; the transcript's does not."""
    sr = backends.SAMPLE_RATE
    with _provider() as base:
        # 4 MB cap -> ~2 MB of samples -> chunks of about 65 s, so 200 s makes several.
        b = _backend(base, max_bytes=4 * 1024 * 1024)
        audio = np.float32(np.random.RandomState(2).uniform(-0.3, 0.3, sr * 200))
        segs, _ = b.transcribe(
            b.load(""),
            audio,
            language=None,
            initial_prompt=None,
            beam_size=5,
            vad_min_silence_ms=500,
            no_speech_threshold=0.6,
        )
    assert len(segs) > 2
    # Every chunk answers with the same 0.5s/3.0s pair, so a backend that forgot to offset
    # would return them all at 0.5. Strictly increasing starts prove it did not.
    starts = [s.start for s in segs]
    assert starts == sorted(starts)
    assert starts[-1] > 60.0, starts


class _FailingProvider(_FakeProvider):
    def do_POST(self) -> None:  # noqa: N802
        payload = b'{"error":{"message":"model_not_found"}}'
        self.send_response(404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def test_the_providers_own_error_reaches_the_caller() -> None:
    """A wrong key and an unknown model are the two things that will actually happen."""
    with _provider(_FailingProvider) as base:
        b = _backend(base)
        try:
            b.transcribe(
                b.load(""),
                np.zeros(backends.SAMPLE_RATE, dtype=np.float32),
                language=None,
                initial_prompt=None,
                beam_size=5,
                vad_min_silence_ms=500,
                no_speech_threshold=0.6,
            )
        except RuntimeError as e:
            assert "404" in str(e) and "model_not_found" in str(e)
        else:
            raise AssertionError("a 404 should not look like success")


def test_choose_backend_never_returns_the_http_one() -> None:
    """Whatever the environment says. Recognition over HTTP is chosen per job, from the app's
    settings, and two places deciding could disagree -- an install that set it here and then
    switched the app back to local would keep uploading audio while the screen said it did not."""
    os.environ["STT_CLOUD_BASE_URL"] = "https://api.example.com/v1"
    try:
        with _Chooser(False, {"pywhispercpp"}):
            for requested in (None, "", "auto", "openai", "cloud", "http"):
                got = backends.choose_backend(requested, "cpu", None)
                assert got.name != "openai-compatible", requested
    finally:
        os.environ.pop("STT_CLOUD_BASE_URL", None)


def test_it_reports_the_fields_health_asks_every_backend_for() -> None:
    """/health reads .name, .device and .compute off whatever backend is running. A backend
    missing one does not fail at startup -- it fails on the first health poll, which is every
    screen in the app."""
    b = backends.OpenAiCompatibleBackend("https://api.groq.com/openai/v1", "k", "m", 1024)
    assert (b.name, b.device, b.compute) == ("openai-compatible", "remote", "http")


def test_it_reports_the_host_but_never_the_key() -> None:
    b = backends.OpenAiCompatibleBackend("https://api.groq.com/openai/v1", "secret", "m", 1024)
    assert b.host == "api.groq.com"
    assert "secret" not in b.host


def test_the_http_backend_does_not_offer_live_transcription() -> None:
    b = backends.OpenAiCompatibleBackend("https://api.example.com/v1", "k", "m", 1024)
    assert backends.live_transcription_available(b) is False

if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ok   {name}")
            except Exception as e:  # noqa: BLE001
                # Not just AssertionError: a test that reaches real code can fail by raising,
                # and letting that escape would end the run at the first one and hide the rest.
                failed += 1
                print(f"  FAIL {name}: {type(e).__name__}: {e}")
    print("all passed" if not failed else f"{failed} failed")
    sys.exit(1 if failed else 0)
