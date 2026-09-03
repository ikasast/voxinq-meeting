"""Backend selection, which is the part that decides what a machine actually runs.

Run with: python -m pytest stt-service/test_backends.py   (or plain `python test_backends.py`)

Mostly this is about the rules: which backend a machine picks, and the promise that a CUDA
host keeps behaving exactly as it did before backends existed. faster-whisper inference needs
a GPU and several gigabytes, so it stays untested here -- but whisper.cpp runs on any CPU with
a 75 MB model, and one real decode is included at the bottom, because a bug hid in the gap
between "the rules are right" and "the call works".
"""

from __future__ import annotations

import base64
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
            "user_agent": self.headers.get("User-Agent"),
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


def test_it_identifies_itself() -> None:
    """Groq sits behind Cloudflare, which answers urllib's default `Python-urllib/3.x` with a
    403 and "error code: 1010" before the request reaches the API -- with nothing wrong with
    the key or the model, and nothing in the message to say so. A stub that accepts anything
    cannot catch that, which is how it shipped; this one looks."""
    with _provider() as base:
        b = _backend(base)
        b.transcribe(
            b.load(""),
            np.zeros(backends.SAMPLE_RATE, dtype=np.float32),
            language=None,
            initial_prompt=None,
            beam_size=5,
            vad_min_silence_ms=500,
            no_speech_threshold=0.6,
        )
    ua = _FakeProvider.received["user_agent"]
    assert ua, "no User-Agent sent"
    assert "urllib" not in ua.lower(), ua
    assert "Voxinq" in ua, ua


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
        # Drain the request first. Answering an unread body resets the connection on Windows
        # (WinError 10053), and the client never gets to read the 404 this test is about.
        self.rfile.read(int(self.headers["Content-Length"]))
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


# --- Gemini ------------------------------------------------------------------------------
#
# Google returns words; this app's unit is an utterance with a timestamp. The regrouping is
# ours, so it is what these test -- along with the request shape, which differs from the other
# backend in every part that matters: a different path, a different auth header, and audio
# inline as base64 rather than as a multipart file.


def test_durations_are_read_the_way_google_writes_them() -> None:
    assert backends._seconds("1.250s") == 1.25
    assert backends._seconds("0s") == 0.0
    assert backends._seconds(2.5) == 2.5
    # Anything unreadable is 0 rather than an exception: one malformed word must not lose the
    # whole chunk.
    assert backends._seconds(None) == 0.0
    assert backends._seconds("nonsense") == 0.0


def _w(text, start, end, speaker="spk_1"):
    return {"type": "word_info", "text": text, "speaker": speaker,
            "start_offset": f"{start}s", "end_offset": f"{end}s"}


def test_words_become_one_utterance_when_they_run_together() -> None:
    segs = backends.group_words([_w("hello", 0.0, 0.4), _w("there", 0.45, 0.9)])
    assert len(segs) == 1
    assert segs[0].text == "hello there"
    assert segs[0].start == 0.0 and segs[0].end == 0.9


def test_a_pause_ends_an_utterance() -> None:
    segs = backends.group_words(
        [_w("first", 0.0, 0.5), _w("second", 3.0, 3.4)], gap_s=0.7
    )
    assert [s.text for s in segs] == ["first", "second"]
    assert segs[1].start == 3.0


def test_an_unbroken_stretch_is_still_broken_up() -> None:
    """A gap threshold cannot help with someone who does not pause, and one enormous line is a
    transcript you cannot navigate: every timestamp click lands at its start."""
    words = [_w(f"w{i}", i * 1.0, i * 1.0 + 0.9) for i in range(40)]  # 40 s, no gap over 0.1
    segs = backends.group_words(words, gap_s=0.35, max_s=10)
    assert len(segs) >= 3, [round(s.end - s.start, 1) for s in segs]
    assert all(s.end - s.start <= 11 for s in segs)
    # No word is lost or repeated across the break.
    assert sum(len(s.text.split()) for s in segs) == 40


def test_the_gap_threshold_matches_what_gemini_actually_reports() -> None:
    """Its timings run contiguously; the longest gap measured across a real meeting was 0.6 s.
    At the streaming side's 0.7 s nothing would ever split."""
    assert backends.GEMINI_SEGMENT_GAP_S < 0.6


def test_a_speaker_change_ends_one_too() -> None:
    """Words either side belong to different people whatever the timing says."""
    segs = backends.group_words(
        [_w("mine", 0.0, 0.5, "spk_1"), _w("yours", 0.55, 1.0, "spk_2")], gap_s=0.7
    )
    assert [s.text for s in segs] == ["mine", "yours"]


def test_japanese_is_not_joined_with_spaces() -> None:
    """" こ ん に ち は " is not a transcript."""
    segs = backends.group_words([_w("こんにちは", 0.0, 0.6), _w("世界", 0.65, 1.0)])
    assert segs[0].text == "こんにちは世界"


def test_empty_and_malformed_words_are_skipped_not_fatal() -> None:
    segs = backends.group_words([_w("kept", 0.0, 0.4), {"type": "word_info", "text": "  "}, {}])
    assert [s.text for s in segs] == ["kept"]


class _FakeGemini(_FakeProvider):
    reply: dict = {}

    def do_POST(self) -> None:  # noqa: N802
        body = self.rfile.read(int(self.headers["Content-Length"]))
        _FakeGemini.received = {
            "path": self.path,
            "api_key_header": self.headers.get("x-goog-api-key"),
            "authorization": self.headers.get("Authorization"),
            "user_agent": self.headers.get("User-Agent"),
            "body": body,
        }
        payload = json.dumps(_FakeGemini.reply).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def _run_gemini(reply: dict, seconds: int = 1):
    _FakeGemini.reply = reply
    with _provider(_FakeGemini) as base:
        b = backends.GeminiBackend(base, "test-key", "gemini-3.5-transcribe", 20 * 1024 * 1024)
        segs, lang = b.transcribe(
            b.load(""),
            np.zeros(backends.SAMPLE_RATE * seconds, dtype=np.float32),
            language=None,
            initial_prompt=None,
            beam_size=5,
            vad_min_silence_ms=500,
            no_speech_threshold=0.6,
        )
    return segs, lang, _FakeGemini.received


def test_the_request_is_the_shape_google_actually_wants() -> None:
    segs, _, got = _run_gemini(
        {"steps": [{"type": "content", "content": [
            {"type": "text", "text": "hi", "annotations": [_w("hi", 0.0, 0.4)]}
        ]}]}
    )
    # Appended to whatever base is configured: /v1beta/interactions against Google, and the
    # stub's own root here. What matters is the endpoint name, not the prefix.
    assert got["path"].endswith("/interactions"), got["path"]
    # Google's own header. An Authorization bearer is ignored there and the call reads as
    # unauthenticated, which is a 401 with nothing to explain it.
    assert got["api_key_header"] == "test-key"
    assert got["authorization"] is None
    assert "urllib" not in (got["user_agent"] or "").lower()

    body = json.loads(got["body"])
    assert body["model"] == "gemini-3.5-transcribe"
    kinds = [part["type"] for part in body["input"]]
    assert kinds == ["text", "audio"]
    audio = body["input"][1]
    assert audio["mime_type"] == "audio/wav"
    assert base64.b64decode(audio["data"]).startswith(b"RIFF")
    assert [s.text for s in segs] == ["hi"]

    # Asking for timestamps is load-bearing: without this block the reply is prose with no
    # timings, verified against the real API.
    mode = body["generation_config"]["transcription_config"]["mode"]
    assert mode["timestamp_granularities"] == ["word"]
    assert mode["diarization_mode"] == "speaker"


def test_it_falls_back_to_the_plain_transcript_when_no_words_come_back() -> None:
    """Worse than real boundaries, and better than dropping the audio."""
    segs, _, _ = _run_gemini(
        {"steps": [{"type": "content", "content": [{"type": "text", "text": "  the whole chunk  "}]}]}
    )
    assert len(segs) == 1
    assert segs[0].text == "the whole chunk"


def test_timestamps_are_offset_onto_the_meetings_clock() -> None:
    reply = {
        # A real reply often leads with the model's own working, which carries a signature and
        # no content at all. Indexing into steps[0] would miss the transcript entirely.
        "steps": [
            {"type": "thought", "signature": "..."},
            {"type": "content", "content": [
                {"type": "text", "text": "word", "annotations": [_w("word", 0.5, 1.0)]}
            ]},
        ],
    }
    _FakeGemini.reply = reply
    with _provider(_FakeGemini) as base:
        # A small cap forces several chunks out of 200 s, each answering with the same 0.5s.
        b = backends.GeminiBackend(base, "k", "m", 4 * 1024 * 1024)
        audio = np.float32(np.random.RandomState(3).uniform(-0.3, 0.3, backends.SAMPLE_RATE * 200))
        segs, _ = b.transcribe(
            b.load(""), audio, language=None, initial_prompt=None,
            beam_size=5, vad_min_silence_ms=500, no_speech_threshold=0.6,
        )
    assert len(segs) > 2
    starts = [s.start for s in segs]
    assert starts == sorted(starts)
    assert starts[-1] > 60.0, starts


def test_the_audio_budget_allows_for_base64() -> None:
    """The cap is on the request, and base64 is four bytes for every three."""
    b = backends.GeminiBackend("https://x/v1beta", "k", "m", 20 * 1024 * 1024)
    assert b.max_bytes < 20 * 1024 * 1024 * 0.76


def test_it_reports_the_fields_health_asks_every_backend_for() -> None:
    b = backends.GeminiBackend("https://generativelanguage.googleapis.com/v1beta", "k", "m", 1024)
    assert (b.name, b.device, b.compute) == ("gemini", "remote", "http")
    assert b.host == "generativelanguage.googleapis.com"
    assert backends.live_transcription_available(b) is False



# --- "it worked" is not the same as "it worked well" ------------------------------------------
#
# A remote endpoint that answers with the transcript and no timings still succeeds. What comes
# back is one unbroken utterance per chunk, every timestamp click lands at its start, and
# speaker separation finds one speaker because there is one line to attribute. That happened on
# a real meeting -- 42.8 seconds, one utterance, one speaker -- and nothing on the screen said
# why. These cover the sentence that now does.


def test_a_note_is_only_produced_when_something_was_missing() -> None:
    assert backends.untimed_note(0, 3, "cause") is None
    note = backends.untimed_note(3, 3, "x returned no timings")
    assert note and note.startswith("x returned no timings.")
    # No "3 of 3": when every part is affected, counting them adds nothing.
    assert "of 3" not in note


def test_a_note_counts_the_parts_when_only_some_were_missing() -> None:
    note = backends.untimed_note(2, 5, "x returned no timings")
    assert "2 of 5 parts" in note


def test_a_note_carries_the_fix_when_there_is_one() -> None:
    note = backends.untimed_note(1, 1, "cause", "Use the other model.")
    assert note.endswith("Use the other model.")


def _gemini_run(reply: dict):
    """Like _run_gemini, but hands back the backend so its note can be read."""
    _FakeGemini.reply = reply
    with _provider(_FakeGemini) as base:
        b = backends.GeminiBackend(base, "k", "gemini-3.5-flash", 20 * 1024 * 1024)
        segs, _ = b.transcribe(
            b.load(""), np.zeros(backends.SAMPLE_RATE, dtype=np.float32),
            language=None, initial_prompt=None,
            beam_size=5, vad_min_silence_ms=500, no_speech_threshold=0.6,
        )
    return segs, b.note


def test_gemini_says_which_model_reports_timings_when_none_came_back() -> None:
    """The model is the whole of it: both names are valid and both "work"."""
    segs, note = _gemini_run(
        {"steps": [{"type": "content", "content": [{"type": "text", "text": "one block"}]}]}
    )
    assert len(segs) == 1
    assert note is not None
    assert "gemini-3.5-flash" in note          # what was asked for
    assert "gemini-3.5-transcribe" in note     # what to ask for instead
    assert "speaker separation" in note


def test_gemini_says_nothing_when_the_timings_arrived() -> None:
    _, note = _gemini_run(
        {"steps": [{"type": "content", "content": [
            {"type": "text", "text": "hi", "annotations": [_w("hi", 0.0, 0.4)]}
        ]}]}
    )
    assert note is None


def test_an_openai_endpoint_without_segments_says_so_too() -> None:
    """Same fallback, same silence, and the same fix does not apply -- so it is not offered."""
    class _TextOnly(_FakeProvider):
        """`verbose_json` answered with the transcript and no `segments` -- some do."""

        def do_POST(self) -> None:  # noqa: N802
            self.rfile.read(int(self.headers["Content-Length"]))
            payload = json.dumps({"text": "one block", "language": "ja"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    with _provider(_TextOnly) as base:
        b = _backend(base)
        segs, _ = b.transcribe(
            b.load(""), np.zeros(backends.SAMPLE_RATE, dtype=np.float32),
            language=None, initial_prompt=None,
            beam_size=5, vad_min_silence_ms=500, no_speech_threshold=0.6,
        )
    assert len(segs) == 1
    assert b.note is not None
    assert "127.0.0.1" in b.note
    assert "gemini" not in b.note.lower()


def test_an_openai_endpoint_with_segments_says_nothing() -> None:
    with _provider() as base:
        b = _backend(base)
        b.transcribe(
            b.load(""), np.zeros(backends.SAMPLE_RATE, dtype=np.float32),
            language=None, initial_prompt=None,
            beam_size=5, vad_min_silence_ms=500, no_speech_threshold=0.6,
        )
    assert b.note is None


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
