"""
Voxinq2 STT service - on-prem Japanese transcription (faster-whisper / CTranslate2).

Receives 16kHz/16bit/mono LE PCM from the browser (phone) over WebSocket, detects
utterance boundaries with an energy-based VAD, and returns finalized text via faster-whisper.
On meeting end, releases the model to free VRAM and yield it to Ollama (GPU time-sharing).

WebSocket protocol (/ws):
  client -> server:
    - text frame  : JSON control message
        {"type":"start", "model":"large-v3"?}   start recognition (optional model override)
        {"type":"end"}                          end recognition (flush remaining buffer, release model)
    - binary frame: Int16LE PCM 16kHz mono (any length, e.g. 100ms chunks)
  server -> client (all JSON text frames):
    {"type":"status","status":"open|closed|loading"}
    {"type":"partial","text":...}                          provisional (interim mid-segment)
    {"type":"final","text":...,"speaker":"spk","seq":n,"start":s,"end":s}  finalized utterance
    {"type":"translation","seq":n,"text":...}              Japanese translation of final #n
    {"type":"error","message":...}

Configuration (environment variables):
  WHISPER_MODEL       default model (large-v3 / medium / distil-large-v3 / small ...)
  WHISPER_DEVICE      cuda (default) / cpu
  WHISPER_COMPUTE     int8_float16 (default, GPU) / int8 / float16
  STT_HOST, STT_PORT  bind target (default 0.0.0.0:8000)
  VAD_SILENCE_MS      split after this many ms considered silence (default 700)
  VAD_MAX_SEGMENT_MS  force a split at this max length in ms (default 12000)
  VAD_MIN_SEGMENT_MS  discard utterances shorter than this (default 300)
  VAD_ENERGY_THRESH   RMS threshold for silence detection (0..1, default 0.012)
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
import threading
import time
import wave
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from translator import preload_translator, translate_to_ja, translator_state

SAMPLE_RATE = 16000

# Where meeting audio and utterance boundaries are saved (on this PC). On meeting end,
# writes <meetingId>.wav and <meetingId>.segments.json for later diarization via /diarize.
RECORDINGS_DIR = Path(os.environ.get("STT_RECORDINGS_DIR", Path(__file__).parent / "recordings"))
# Diarization calls diarize.py in a separate venv (diarization/.venv) as a subprocess.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_DIA_DIR = _REPO_ROOT / "diarization"
_DIA_PYTHON = _DIA_DIR / (".venv/Scripts/python.exe" if sys.platform == "win32" else ".venv/bin/python")
_DIA_SCRIPT = _DIA_DIR / "diarize.py"

DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "int8_float16")

VAD_SILENCE_MS = int(os.environ.get("VAD_SILENCE_MS", "700"))
VAD_MAX_SEGMENT_MS = int(os.environ.get("VAD_MAX_SEGMENT_MS", "12000"))
VAD_MIN_SEGMENT_MS = int(os.environ.get("VAD_MIN_SEGMENT_MS", "300"))
VAD_ENERGY_THRESH = float(os.environ.get("VAD_ENERGY_THRESH", "0.012"))
# If a segment's total voiced time is below this, treat it as "silence" and skip Whisper
# (fundamentally suppresses hallucinations in silent regions, e.g. "ご視聴ありがとうございました").
VAD_MIN_SPEECH_MS = int(os.environ.get("VAD_MIN_SPEECH_MS", "250"))

# Thresholds to drop Whisper inferences originating from silence
STT_NO_SPEECH_THRESH = float(os.environ.get("STT_NO_SPEECH_THRESH", "0.6"))
STT_LOGPROB_THRESH = float(os.environ.get("STT_LOGPROB_THRESH", "-1.0"))

# Minimum interval between provisional ("partial") transcriptions of the segment still being
# spoken. Without partials nothing appears until a segment is finalized (up to
# VAD_MAX_SEGMENT_MS of continuous speech), which reads as the recognizer hanging.
# 0 disables partials.
STT_PARTIAL_MS = int(os.environ.get("STT_PARTIAL_MS", "1200"))

# Retention days for recordings (WAV). Recordings not protected (.keep) are auto-deleted
# after this many days. Set <= 0 to disable auto-deletion.
RETENTION_DAYS = float(os.environ.get("STT_RECORDING_RETENTION_DAYS", "7"))
# Whether to preload the Whisper model at service startup (removes the first-meeting wait).
PRELOAD_ON_START = os.environ.get("STT_PRELOAD", "1").lower() not in ("0", "false", "")
# Release the model after this many seconds with no connection and no load request
# (a safety net to yield VRAM to Ollama).
# Note: releasing immediately on every disconnect would repeatedly destroy the loaded model
#       as reconnects / other connections come and go, causing an endless "loading" state, so
#       do NOT release immediately.
IDLE_RELEASE_SECONDS = int(os.environ.get("STT_IDLE_RELEASE_SECONDS", "600"))

# Which web origins may talk to this service from a browser.
#
# The browser calls this service directly (recording, diarization, downloads), so the
# service must accept the origin the web app is served from. Allowing "*" — the previous
# behaviour — lets ANY site you happen to visit read your recordings through your own
# browser, so the default is now restricted to the origins a self-hosted setup actually
# uses: localhost, private LAN addresses, and Tailscale MagicDNS names (*.ts.net).
#
# Set STT_ALLOWED_ORIGINS to a comma-separated list to pin it down exactly, e.g.
#   STT_ALLOWED_ORIGINS=https://myhost.tailnet.ts.net,http://localhost:3000
_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("STT_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
# Used only when STT_ALLOWED_ORIGINS is unset (zero-config default).
_DEFAULT_ORIGIN_REGEX = (
    r"https?://(localhost|127\.0\.0\.1|\[::1\]"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"|[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.ts\.net)(:\d+)?"
)
_ORIGIN_RE = re.compile(_DEFAULT_ORIGIN_REGEX)


def _origin_allowed(origin: str | None) -> bool:
    """Whether a browser Origin may use this service.

    A missing Origin means a non-browser client (curl, the web server itself), which CORS
    does not govern — allow it, exactly as the CORS middleware does.
    """
    if not origin:
        return True
    if _ALLOWED_ORIGINS:
        return origin in _ALLOWED_ORIGINS
    return bool(_ORIGIN_RE.fullmatch(origin))

# Safety-net blocklist for the canned hallucinations Whisper tends to emit in silence.
# Compared for exact equality against the plain string with symbols removed.
HALLUCINATION_PHRASES = {
    "ご視聴ありがとうございました",
    "ありがとうございました",
    "最後までご視聴いただきありがとうございます",
    "チャンネル登録お願いします",
    "チャンネル登録をお願いします",
    "次の動画でお会いしましょう",
    "おやすみなさい",
    "バイバイ",
}


def _normalize(text: str) -> str:
    """Normalize for blocklist comparison by removing punctuation/whitespace/symbols."""
    return "".join(ch for ch in text if ch not in "。、!?！？.… 　\n\r\t")

# Activity tracking for WS connections and load requests (used to decide idle release).
_ACT_LOCK = threading.Lock()
_ACTIVE_WS = 0
_LAST_ACTIVITY = 0.0  # updated on every ws open/close and preload
# meeting_id -> number of active recording connections (refcount survives brief reconnects).
_RECORDING_MIDS: dict[str, int] = {}


def _touch_activity(delta_ws: int = 0) -> None:
    global _ACTIVE_WS, _LAST_ACTIVITY
    with _ACT_LOCK:
        _ACTIVE_WS += delta_ws
        _LAST_ACTIVITY = time.time()


def _recording_add(mid: str) -> None:
    with _ACT_LOCK:
        _RECORDING_MIDS[mid] = _RECORDING_MIDS.get(mid, 0) + 1


def _recording_remove(mid: str) -> None:
    with _ACT_LOCK:
        n = _RECORDING_MIDS.get(mid, 0) - 1
        if n > 0:
            _RECORDING_MIDS[mid] = n
        else:
            _RECORDING_MIDS.pop(mid, None)


# Latest model a preload was asked for. Held in a one-element list so _preload_model can
# check whether it is still the current request without a module-level global statement.
_PRELOAD_LOCK = threading.Lock()
_preload_target: list[str | None] = [None]


def _preload_model(name: str | None) -> None:
    """Load the model in the background (failures go to the log).

    Preloads are guesses about what the next meeting will use, and callers disagree: the
    New-meeting screen knows the chosen model, while the header and quick-record only know
    the settings default. Loading a different model releases the current one, so two
    disagreeing guesses used to cost two full loads each time. A superseded request is
    therefore dropped rather than queued behind the one that replaced it.
    """
    try:
        with _PRELOAD_LOCK:
            if name != _preload_target[0]:
                return  # a newer preload asked for something else
        model = whisper.get(name)
        with _PRELOAD_LOCK:
            if name != _preload_target[0]:
                return  # superseded while we waited for the load lock
        print(f"[preload] loaded model: {whisper.loaded_model}")
        # One throwaway inference so the first real utterance doesn't pay the remaining lazy
        # costs (Silero VAD's ONNX session, CUDA kernel warm-up) — those add seconds on top
        # of the model load and only hit the very first segment.
        try:
            rng = np.random.default_rng(0)
            noise = (rng.standard_normal(SAMPLE_RATE // 2) * 0.02).astype(np.float32)
            transcribe_segment(model, noise, beam_size=1)
        except Exception:  # noqa: BLE001  warm-up only; the model itself is loaded
            pass
    except Exception as e:  # noqa: BLE001
        print(f"[preload] model load failed: {e}")


async def _idle_release_loop() -> None:
    """Release the model after IDLE_RELEASE_SECONDS pass with no connection and no load request."""
    while True:
        await asyncio.sleep(60)
        if IDLE_RELEASE_SECONDS <= 0 or whisper.loaded_model is None:
            continue
        with _ACT_LOCK:
            idle = _ACTIVE_WS == 0 and (time.time() - _LAST_ACTIVITY) > IDLE_RELEASE_SECONDS
        if idle:
            print(f"[idle] releasing whisper after {IDLE_RELEASE_SECONDS}s of inactivity")
            whisper.release()


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Periodic deletion of expired recordings (hourly) and model release when idle.
    cleanup_task = asyncio.create_task(_cleanup_loop())
    idle_task = asyncio.create_task(_idle_release_loop())
    if PRELOAD_ON_START:
        # Right after startup Ollama is also idle, so warm the model to remove the first-meeting wait.
        _touch_activity()
        with _PRELOAD_LOCK:
            _preload_target[0] = DEFAULT_MODEL
        threading.Thread(target=_preload_model, args=(DEFAULT_MODEL,), daemon=True).start()
    yield
    cleanup_task.cancel()
    idle_task.cancel()


app = FastAPI(title="Voxinq2 STT", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    # Explicit list when configured, otherwise the self-hosted default pattern above.
    allow_origins=_ALLOWED_ORIGINS or [],
    allow_origin_regex=None if _ALLOWED_ORIGINS else _DEFAULT_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WhisperHolder:
    """Singleton that lazily loads and releases the faster-whisper model.

    Keeps it on the GPU only during a meeting; on meeting end (release) it frees VRAM to
    time-share the GPU with Ollama (minutes generation)."""

    def __init__(self) -> None:
        self._model = None
        self._model_name: str | None = None
        self._lock = threading.Lock()

    def get(self, model_name: str | None = None):
        name = model_name or DEFAULT_MODEL
        with self._lock:
            if self._model is not None and self._model_name == name:
                return self._model
            self._release_locked()
            from faster_whisper import WhisperModel

            self._model = WhisperModel(name, device=DEVICE, compute_type=COMPUTE_TYPE)
            self._model_name = name
            return self._model

    def _release_locked(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
            self._model_name = None

    def release(self) -> None:
        with self._lock:
            self._release_locked()

    @property
    def loaded_model(self) -> str | None:
        """Name of the loaded model (None if not loaded). For display."""
        return self._model_name


whisper = WhisperHolder()


def _effective_prompt(model_name: str | None, prompt: str | None) -> str | None:
    """Drop the glossary for models that cannot handle an initial_prompt.

    kotoba-whisper is distilled down to a 2-layer decoder, and feeding it an initial_prompt
    makes it return nothing at all: with the glossary set, a 33s Japanese recording produced
    0 of 3 segments; without it, 3 of 3 were transcribed correctly. Recognition without the
    glossary is far better than silence, so the prompt is dropped rather than the model.
    """
    if prompt and model_name and "kotoba" in model_name.lower():
        return None
    return prompt


def transcribe_segment_ex(
    model,
    audio: np.ndarray,
    language: str | None = None,
    initial_prompt: str | None = None,
    beam_size: int = 5,
) -> tuple[str, str | None]:
    """Transcribe one utterance segment (float32 mono 16k) -> (text, detected language).

    language=None auto-detects the spoken language ("ja"/"en" pins it).
    Passing a glossary as initial_prompt biases recognition toward proper nouns, etc.
    beam_size=1 (greedy) is used for disposable partials; finals keep the accurate default.
    The detected language decides whether the utterance gets translated.
    Suppresses silence-derived hallucinations in three stages:
      - remove non-speech regions with Whisper's built-in VAD (silero)
      - discard low-confidence segments by no_speech_prob / avg_logprob
      - blocklist of known canned phrases
    """
    segments, info = model.transcribe(
        audio,
        language=language,
        initial_prompt=initial_prompt or None,
        beam_size=beam_size,
        vad_filter=True,  # boundaries are handled by the caller's VAD, but this also suppresses internal-silence hallucinations
        vad_parameters=dict(min_silence_duration_ms=300),
        condition_on_previous_text=False,
        no_speech_threshold=STT_NO_SPEECH_THRESH,
    )
    out: list[str] = []
    for seg in segments:
        t = seg.text.strip()
        if not t:
            continue
        # Silence hallucination: drop segments with high no-speech prob AND low avg logprob
        if (
            getattr(seg, "no_speech_prob", 0.0) >= STT_NO_SPEECH_THRESH
            and getattr(seg, "avg_logprob", 0.0) <= STT_LOGPROB_THRESH
        ):
            continue
        if _normalize(t) in HALLUCINATION_PHRASES:
            continue
        out.append(t)
    return "".join(out).strip(), getattr(info, "language", None)


def transcribe_segment(
    model,
    audio: np.ndarray,
    language: str | None = None,
    initial_prompt: str | None = None,
    beam_size: int = 5,
) -> str:
    """transcribe_segment_ex for callers that only need the text."""
    text, _lang = transcribe_segment_ex(model, audio, language, initial_prompt, beam_size)
    return text


def voiced_ms(audio: np.ndarray, frame: int) -> float:
    """Total voiced (RMS>=threshold) frame time [ms] within a segment. Used for silence detection."""
    n = audio.size // frame
    if n == 0:
        return 0.0
    frames = audio[: n * frame].reshape(n, frame)
    fr_rms = np.sqrt(np.mean(frames * frames, axis=1))
    voiced = int(np.count_nonzero(fr_rms >= VAD_ENERGY_THRESH))
    return voiced * (frame / SAMPLE_RATE) * 1000.0


@dataclass
class StreamState:
    model_name: str | None = None
    meeting_id: str | None = None
    language: str | None = None  # None=auto-detect
    initial_prompt: str | None = None  # glossary (recognition bias)
    translate: bool = False  # translate non-Japanese utterances into Japanese (CPU)
    seq: int = 0  # per-connection utterance number, used to attach translations to finals
    buffer: np.ndarray = None  # type: ignore[assignment]
    silence_samples: int = 0
    elapsed_samples: int = 0  # cumulative from the stream start (for timestamps)
    seg_start_sample: int = 0
    # For diarization: the whole meeting audio (list of chunks) and finalized-utterance times (order = save order).
    full_audio: list[np.ndarray] = field(default_factory=list)
    finals: list[dict] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.buffer is None:
            self.buffer = np.zeros(0, dtype=np.float32)


def _safe_meeting_id(mid: str | None) -> str | None:
    """Path-traversal guard. Allow only alphanumerics plus hyphen/underscore (e.g. cuid)."""
    if mid and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", mid):
        return mid
    return None


def _existing_recording_samples(meeting_id: str) -> int:
    """Length of the recording already on disk, in samples. 0 when there is none.

    A resumed meeting appends to that file, so this is where the next session's timeline starts.
    """
    path = RECORDINGS_DIR / f"{meeting_id}.wav"
    try:
        with wave.open(str(path), "rb") as w:
            if w.getframerate() != SAMPLE_RATE or w.getnchannels() != 1:
                return 0
            return w.getnframes()
    except Exception:  # noqa: BLE001  missing or unreadable — start from zero
        return 0


def save_recording(meeting_id: str, chunks: list[np.ndarray], finals: list[dict]) -> None:
    """Save the meeting audio (WAV) and finalized-utterance boundaries (JSON) on this PC.

    So a meeting split across multiple recording sessions still maps to its utterances, it
    **appends to the existing recording** instead of overwriting. The incoming boundaries are
    already offsets into the whole recording — the session's clock was started at the existing
    length (see the `start` handler) — so they are stored as they arrive. When the recording
    changes, cached diarization results are invalidated.
    """
    if not chunks:
        return
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = RECORDINGS_DIR / f"{meeting_id}.wav"
    seg_path = RECORDINGS_DIR / f"{meeting_id}.segments.json"
    spk_path = RECORDINGS_DIR / f"{meeting_id}.speakers.json"

    audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
    new_pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()

    # If an existing recording is present, read it so the new audio is appended to it.
    prev_pcm = b""
    prev_finals: list[dict] = []
    if wav_path.exists() and seg_path.exists():
        try:
            with wave.open(str(wav_path), "rb") as w:
                if w.getframerate() == SAMPLE_RATE and w.getnchannels() == 1:
                    prev_pcm = w.readframes(w.getnframes())
                    prev_finals = json.loads(seg_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001  if corrupted, treat as new
            prev_pcm, prev_finals = b"", []

    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(prev_pcm + new_pcm)

    seg_path.write_text(json.dumps(prev_finals + finals, ensure_ascii=False), encoding="utf-8")

    # The recording content changed, so invalidate the previous diarization-result cache.
    for stale in (spk_path, RECORDINGS_DIR / f"{meeting_id}.embeddings.json"):
        try:
            stale.unlink()
        except FileNotFoundError:
            pass
    with _DIA_LOCK:
        _DIA_JOBS.pop(meeting_id, None)


def pcm16_to_float32(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype="<i2").astype(np.float32)
    return arr / 32768.0


def rms(frame: np.ndarray) -> float:
    if frame.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(frame * frame)))


@app.get("/health")
async def health() -> dict:
    jobs = _running_jobs()
    with _ACT_LOCK:
        recording = _ACTIVE_WS > 0
    busy = recording or bool(jobs["transcribe"] or jobs["diarize"])
    kind = (
        "recording"
        if recording
        else "transcribe"
        if jobs["transcribe"]
        else "diarize"
        if jobs["diarize"]
        else None
    )
    return {
        "status": "ok",
        "model": DEFAULT_MODEL,
        "device": DEVICE,
        "loaded": whisper.loaded_model,
        "busy": busy,
        "busyKind": kind,
        "translate": translator_state(),
    }


@app.post("/preload")
async def preload(model: str | None = None, translate: bool = False) -> dict:
    """Preload the Whisper model in the background.

    Loading takes tens of seconds, so call this when the recording page opens to warm it up.
    If already loaded, returns ready immediately.

    `translate=1` also warms the translation model. It is on the CPU, so it loads alongside
    Whisper rather than competing with it — and without this the first non-Japanese utterance
    triggers a ~600MB download mid-meeting, whose result arrives after the meeting has ended.
    """
    name = model or DEFAULT_MODEL
    _touch_activity()
    if translate:
        threading.Thread(target=preload_translator, daemon=True).start()
    with _PRELOAD_LOCK:
        _preload_target[0] = name
    if whisper.loaded_model == name:
        return {"status": "ready", "model": name}
    threading.Thread(target=_preload_model, args=(name,), daemon=True).start()
    return {"status": "loading", "model": name}


# ---- Recording retention policy ----
# Recordings (WAV) auto-delete after 7 days by default. Meetings with a <mid>.keep are protected (not deleted).
# On un-protect, the WAV's mtime is set to now, keeping it for the retention period from there.


def _rec_paths(mid: str) -> dict[str, Path]:
    return {
        "wav": RECORDINGS_DIR / f"{mid}.wav",
        "seg": RECORDINGS_DIR / f"{mid}.segments.json",
        "spk": RECORDINGS_DIR / f"{mid}.speakers.json",
        "emb": RECORDINGS_DIR / f"{mid}.embeddings.json",
        "keep": RECORDINGS_DIR / f"{mid}.keep",
    }


def _read_cached_embeddings(mid: str) -> dict:
    """Cached per-speaker voice embeddings from the last diarization run ({} if none)."""
    path = RECORDINGS_DIR / f"{mid}.embeddings.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {}


def _recording_state(mid: str) -> dict:
    p = _rec_paths(mid)
    if not p["wav"].exists():
        return {"exists": False}
    protected = p["keep"].exists()
    st = p["wav"].stat()
    expires = (
        datetime.fromtimestamp(st.st_mtime + RETENTION_DAYS * 86400, tz=timezone.utc).isoformat()
        if not protected and RETENTION_DAYS > 0
        else None
    )
    # Utterance boundaries within the WAV. The web app seeks with the offsets stored on each
    # transcript row, and falls back to these positionally for meetings recorded before those
    # were kept — the same index correspondence diarization relies on.
    first_start = 0.0
    segments: list[dict] = []
    try:
        segs = json.loads(p["seg"].read_text(encoding="utf-8"))
        if isinstance(segs, list) and segs and isinstance(segs[0], dict):
            segments = [
                {"start": float(s.get("start", 0.0)), "end": float(s.get("end", 0.0))}
                for s in segs
                if isinstance(s, dict)
            ]
            first_start = segments[0]["start"] if segments else 0.0
    except Exception:  # noqa: BLE001
        pass
    return {
        "exists": True,
        "protected": protected,
        "expiresAt": expires,
        "sizeBytes": st.st_size,
        "firstUtteranceStart": round(first_start, 2),
        "segments": segments,
    }


def _cleanup_recordings_once() -> None:
    """Delete the full set of unprotected recordings past the retention deadline."""
    if RETENTION_DAYS <= 0:
        return
    cutoff = time.time() - RETENTION_DAYS * 86400
    for wav in RECORDINGS_DIR.glob("*.wav"):
        mid = wav.stem
        p = _rec_paths(mid)
        try:
            if p["keep"].exists() or wav.stat().st_mtime >= cutoff:
                continue
            for f in (p["wav"], p["seg"], p["spk"], p["emb"]):
                f.unlink(missing_ok=True)
            print(f"[retention] deleted recording {mid} (older than {RETENTION_DAYS:g} days)")
        except OSError:
            pass


async def _cleanup_loop() -> None:
    while True:
        await asyncio.to_thread(_cleanup_recordings_once)
        await asyncio.sleep(3600)


def _wav_duration_sec(path: Path) -> float | None:
    """Recorded length from the WAV header (frames / rate). None if unreadable."""
    try:
        with wave.open(str(path), "rb") as w:
            rate = w.getframerate() or SAMPLE_RATE
            return w.getnframes() / float(rate)
    except Exception:  # noqa: BLE001
        return None


@app.get("/recordings/{meeting_id}")
async def recording_info(meeting_id: str) -> dict:
    """Return whether a recording exists, its protection state, the auto-deletion schedule,
    and the recorded length (durationSec). The web app stores the length on the meeting at end."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    state = _recording_state(mid)
    if state.get("exists"):
        state["durationSec"] = _wav_duration_sec(_rec_paths(mid)["wav"])
    return state


@app.post("/recordings/states")
async def recording_states(request: Request) -> dict:
    """Return recording states for multiple meetings at once. For the list's recording/protection badges (avoids N+1).

    body (JSON): {"ids": ["<meetingId>", ...]}
    returns: {"<id>": {exists, protected, expiresAt}, ...}"""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    ids = body.get("ids") if isinstance(body, dict) else None
    out: dict[str, dict] = {}
    if isinstance(ids, list):
        for raw in ids[:500]:
            mid = _safe_meeting_id(raw if isinstance(raw, str) else None)
            if mid:
                out[mid] = _recording_state(mid)
    return out


@app.post("/activity")
async def activity_states(request: Request) -> dict:
    """Current live GPU activity per meeting, for the list's status labels (avoids N+1).

    body (JSON): {"ids": ["<meetingId>", ...]}
    returns: {"<id>": "recording"|"transcribe"|"diarize"|null, ...}"""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    ids = body.get("ids") if isinstance(body, dict) else None
    jobs = _running_jobs()
    with _ACT_LOCK:
        recording = set(_RECORDING_MIDS)
    transcribing = set(jobs["transcribe"])
    diarizing = set(jobs["diarize"])
    out: dict[str, str | None] = {}
    if isinstance(ids, list):
        for raw in ids[:500]:
            mid = _safe_meeting_id(raw if isinstance(raw, str) else None)
            if not mid:
                continue
            out[mid] = (
                "recording"
                if mid in recording
                else "transcribe"
                if mid in transcribing
                else "diarize"
                if mid in diarizing
                else None
            )
    return out


@app.get("/recordings/{meeting_id}/audio")
async def recording_audio(meeting_id: str) -> FileResponse:
    """Return the saved meeting audio (WAV). For the recording player on the detail page.

    The browser's <audio> issues Range requests (seek), so serve it via FileResponse."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    wav = _rec_paths(mid)["wav"]
    if not wav.exists():
        raise HTTPException(status_code=404, detail="Recording not found")
    return FileResponse(wav, media_type="audio/wav", filename=f"{mid}.wav")


def _read_json_file(path: Path):
    """Parse a sidecar JSON file, or None when it is absent or unreadable."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return None


@app.get("/recordings/{meeting_id}/sidecars")
async def recording_sidecars(meeting_id: str) -> dict:
    """Return the JSON files that live beside a recording, for the web app's backup export.

    The WAV is fetched separately (/recordings/{id}/audio); these are small and inlined."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    p = _rec_paths(mid)
    return {
        "exists": p["wav"].exists(),
        "keep": p["keep"].exists(),
        "segments": _read_json_file(p["seg"]),
        "speakers": _read_json_file(p["spk"]),
        "embeddings": _read_json_file(p["emb"]),
    }


@app.post("/recordings/{meeting_id}/restore")
async def recording_restore(meeting_id: str, request: Request) -> dict:
    """Write a recording back from a backup. Raw WAV body.

    Deliberately not /upload/{id}: that one decodes the audio and starts transcription, which
    would burn GPU time re-deriving a transcript the backup already contains — and would
    overwrite it. This only puts the file back where it was.

    An existing recording is left alone rather than overwritten, so importing the same bundle
    twice is a no-op."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    p = _rec_paths(mid)
    if p["wav"].exists():
        return {"status": "exists", "skipped": True}

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="empty body")
    # Check it really is a WAV before writing: a mangled upload here would surface much later,
    # as a player that will not play and a diarization that cannot read its input.
    if len(data) < 12 or data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise HTTPException(status_code=400, detail="not a WAV file")

    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = p["wav"].with_suffix(".wav.part")
    tmp.write_bytes(data)
    tmp.replace(p["wav"])
    return {"status": "restored", "skipped": False, "bytes": len(data)}


@app.post("/recordings/{meeting_id}/sidecars")
async def recording_sidecars_write(meeting_id: str, request: Request) -> dict:
    """Write the JSON files beside a restored recording (backup import).

    Existing files are kept: the utterance boundaries and speaker assignments on this host
    describe the WAV that is already here, and a re-import must not disturb them."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="expected an object")

    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    p = _rec_paths(mid)
    written = []
    for key, path_key in (("segments", "seg"), ("speakers", "spk"), ("embeddings", "emb")):
        value = payload.get(key)
        if value is None or p[path_key].exists():
            continue
        p[path_key].write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        written.append(key)
    if payload.get("keep") is True and not p["keep"].exists():
        p["keep"].touch()
        written.append("keep")
    return {"status": "ok", "written": written}


@app.post("/recordings/{meeting_id}/protect")
async def recording_protect(meeting_id: str, on: bool = True) -> dict:
    """Toggle recording protection (exempt from auto-delete). On un-protect, keep it for the retention period from that point."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    p = _rec_paths(mid)
    if not p["wav"].exists():
        raise HTTPException(status_code=404, detail="Recording not found")
    if on:
        p["keep"].touch()
    else:
        p["keep"].unlink(missing_ok=True)
        # Reset the deadline origin to now, to avoid "deleted right after un-protecting".
        os.utime(p["wav"], None)
    return _recording_state(mid)


@app.post("/recordings/{meeting_id}/segments/delete")
async def recording_segment_delete(meeting_id: str, request: Request) -> dict:
    """Drop one utterance boundary, keeping this side aligned with the web app's transcripts.

    Diarization maps speakers onto utterances *by index*: segments.json entry N is DB row N.
    Deleting a row on the web side without deleting the matching boundary here would shift
    every later speaker by one. Only applies when the counts still agree — a recording that
    has already drifted is left untouched and reported back as unsynced.

    body: {"index": int, "expectedCount": int}
    """
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    index = body.get("index") if isinstance(body, dict) else None
    expected = body.get("expectedCount") if isinstance(body, dict) else None
    if not isinstance(index, int) or not isinstance(expected, int):
        raise HTTPException(status_code=400, detail="index and expectedCount are required")

    p = _rec_paths(mid)
    try:
        segments = json.loads(p["seg"].read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001  no boundaries saved (or unreadable) — nothing to sync
        return {"synced": False, "reason": "no segments"}
    if not isinstance(segments, list) or len(segments) != expected or not 0 <= index < len(segments):
        return {"synced": False, "reason": "count mismatch", "count": len(segments) if isinstance(segments, list) else 0}

    del segments[index]
    p["seg"].write_text(json.dumps(segments, ensure_ascii=False), encoding="utf-8")

    # Speaker assignments are the same per-utterance list, so keep them in step.
    try:
        speakers = json.loads(p["spk"].read_text(encoding="utf-8"))
        if isinstance(speakers, list) and len(speakers) == expected:
            del speakers[index]
            p["spk"].write_text(json.dumps(speakers, ensure_ascii=False), encoding="utf-8")
    except Exception:  # noqa: BLE001  no cached diarization — nothing to keep in step
        pass
    return {"synced": True, "count": len(segments)}


@app.delete("/recordings/{meeting_id}")
async def recording_delete(meeting_id: str) -> dict:
    """Delete the full recording set (WAV, utterance boundaries, diarization results, protection marker). Called by Web on meeting deletion."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    for f in _rec_paths(mid).values():
        f.unlink(missing_ok=True)
    with _DIA_LOCK:
        _DIA_JOBS.pop(mid, None)
    return {"ok": True}


def _run_diarizer(
    wav_path: Path, seg_path: Path, num_speakers: int | None, mid: str | None = None
) -> dict:
    """Run diarize.py in the diarization venv as a subprocess.

    When `mid` is given, the process is registered so it can be cancelled (see /diarize/{id}/cancel).
    Returns {"speakers": [...], "embeddings": {label: [float,...]}} — per-utterance
    speaker labels plus per-speaker voice embeddings (may be missing/empty)."""
    env = dict(os.environ)
    # Diarization runs after the meeting when Whisper is already released, so default to GPU (cuda).
    # Override via the DIA_DEVICE env var (can fall back to cpu).
    env.setdefault("DIA_DEVICE", "cuda")
    env["PYTHONIOENCODING"] = "utf-8"
    if num_speakers:
        env["DIA_NUM_SPEAKERS"] = str(num_speakers)
    proc = subprocess.Popen(
        [str(_DIA_PYTHON), str(_DIA_SCRIPT), str(wav_path), str(seg_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=env,
    )
    if mid:
        with _DIA_LOCK:
            _DIA_PROCS[mid] = proc
    try:
        out, err = proc.communicate()
    finally:
        if mid:
            with _DIA_LOCK:
                _DIA_PROCS.pop(mid, None)
    if proc.returncode != 0:
        # Non-zero also covers a cancel (terminate/kill) — surface a short reason.
        raise RuntimeError((err or "").strip()[-500:] or "diarize cancelled or failed")
    lines = [ln for ln in (out or "").splitlines() if ln.strip()]
    if not lines:
        raise RuntimeError("diarizer returned no output")
    payload = json.loads(lines[-1])
    return {"speakers": payload["speakers"], "embeddings": payload.get("embeddings") or {}}


# Diarization can take several to a dozen-plus minutes on CPU (~0.5x the audio length).
# Synchronous HTTP would time out in the browser/proxy, so use a background job + polling.
_DIA_LOCK = threading.Lock()
_DIA_JOBS: dict[str, dict] = {}  # meeting_id -> {"status": running|done|error, "speakers"?, "detail"?}
_DIA_PROCS: dict[str, subprocess.Popen] = {}  # meeting_id -> running diarizer process (for cancel)


def _needs_hf_token(err: str) -> bool:
    """Is this the "no Hugging Face token" failure wearing a traceback?

    It is the first wall almost every new install hits: recording and minutes work without a
    token, so nothing goes wrong until the first diarization, and what surfaces is the tail of
    a Python exception about a gated repo. Callers turn a True here into an instruction.
    """
    low = err.lower()
    return (
        "gated repo" in low
        or "is restricted" in low
        or "awaiting a review" in low
        or ("401" in low and "huggingface" in low)
    )


def _diarize_job(mid: str, wav: Path, seg: Path, num_speakers: int | None) -> None:
    try:
        result = _run_diarizer(wav, seg, num_speakers, mid)
        speakers = result["speakers"]
        embeddings = result.get("embeddings") or {}
        with open(RECORDINGS_DIR / f"{mid}.speakers.json", "w", encoding="utf-8") as f:
            json.dump(speakers, f, ensure_ascii=False)
        # Per-speaker voice embeddings for voice-profile enrollment/recognition on the web side.
        with open(RECORDINGS_DIR / f"{mid}.embeddings.json", "w", encoding="utf-8") as f:
            json.dump(embeddings, f, ensure_ascii=False)
        with _DIA_LOCK:
            _DIA_JOBS[mid] = {"status": "done", "speakers": speakers, "embeddings": embeddings}
    except Exception as e:  # noqa: BLE001
        detail = str(e)[-300:]
        job: dict = {"status": "error", "detail": detail}
        if _needs_hf_token(str(e)):
            job["code"] = "hf_token_required"
        with _DIA_LOCK:
            _DIA_JOBS[mid] = job


@app.post("/diarize/{meeting_id}")
async def diarize_start(meeting_id: str, num_speakers: int | None = None, force: bool = False) -> dict:
    """Start diarization in the background. Check progress via GET /diarize/{id}/status."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    wav = RECORDINGS_DIR / f"{mid}.wav"
    seg = RECORDINGS_DIR / f"{mid}.segments.json"
    if not wav.exists() or not seg.exists():
        raise HTTPException(status_code=404, detail="Recording not found (meeting not yet saved, or already deleted)")
    if not _DIA_PYTHON.exists() or not _DIA_SCRIPT.exists():
        raise HTTPException(status_code=500, detail="Diarization environment not found")

    # Global GPU lock: don't start if another meeting's GPU job is running.
    reason = _gpu_busy_other(mid)
    if reason:
        raise HTTPException(status_code=409, detail=reason)

    with _DIA_LOCK:
        cur = _DIA_JOBS.get(mid)
        if cur and cur.get("status") == "running":
            return {"status": "running"}

    cached = RECORDINGS_DIR / f"{mid}.speakers.json"
    if cached.exists() and not force:
        speakers = json.loads(cached.read_text(encoding="utf-8"))
        embeddings = _read_cached_embeddings(mid)
        with _DIA_LOCK:
            _DIA_JOBS[mid] = {"status": "done", "speakers": speakers, "embeddings": embeddings}
        return {"status": "done", "speakers": speakers, "embeddings": embeddings}

    with _DIA_LOCK:
        _DIA_JOBS[mid] = {"status": "running"}
    threading.Thread(target=_diarize_job, args=(mid, wav, seg, num_speakers), daemon=True).start()
    return {"status": "running"}


@app.get("/diarize/{meeting_id}/status")
async def diarize_status(meeting_id: str) -> dict:
    """State of the diarization job. When done, includes speakers (per-utterance speaker labels)."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    with _DIA_LOCK:
        job = _DIA_JOBS.get(mid)
    if job:
        return {
            "status": job["status"],
            **{k: job[k] for k in ("speakers", "embeddings", "detail") if k in job},
        }
    cached = RECORDINGS_DIR / f"{mid}.speakers.json"
    if cached.exists():
        return {
            "status": "done",
            "speakers": json.loads(cached.read_text(encoding="utf-8")),
            "embeddings": _read_cached_embeddings(mid),
        }
    return {"status": "none"}


@app.post("/diarize/{meeting_id}/cancel")
async def diarize_cancel(meeting_id: str) -> dict:
    """Stop a running diarization: terminate the subprocess and mark the job stopped."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    with _DIA_LOCK:
        proc = _DIA_PROCS.get(mid)
        running = (_DIA_JOBS.get(mid) or {}).get("status") == "running"
    if proc and proc.poll() is None:
        proc.terminate()  # the job thread then records status=error; the client shows "Stopped"
    with _DIA_LOCK:
        if (_DIA_JOBS.get(mid) or {}).get("status") == "running":
            _DIA_JOBS[mid] = {"status": "error", "detail": "cancelled"}
    return {"status": "cancelled" if (proc or running) else "idle"}


# ---- Re-transcription from a saved recording ----
# Redo the realtime recognition. Re-run Whisper over the whole saved WAV and replace the
# utterance boundaries (segments.json) with the new results.
# After replacement, the utterance-to-boundary mapping is based on the new results, so discard the diarization cache.

_TR_LOCK = threading.Lock()
_TR_JOBS: dict[str, dict] = {}  # meeting_id -> {"status": running|done|error, "utterances"?, "detail"?}


def _running_jobs() -> dict:
    """Meeting ids of currently running diarize/transcribe jobs (for the global GPU lock)."""
    with _DIA_LOCK:
        dia = [m for m, j in _DIA_JOBS.items() if j.get("status") == "running"]
    with _TR_LOCK:
        tr = [m for m, j in _TR_JOBS.items() if j.get("status") == "running"]
    return {"diarize": dia, "transcribe": tr}


def _gpu_busy_other(mid: str) -> str | None:
    """Return a reason string if a GPU job for a DIFFERENT meeting is running, else None.

    Diarization (pyannote) and re-transcription (Whisper) both use the single GPU, so only
    one may run at a time to avoid VRAM contention."""
    jobs = _running_jobs()
    for m in jobs["transcribe"]:
        if m != mid:
            return "another re-transcription is running"
    for m in jobs["diarize"]:
        if m != mid:
            return "another diarization is running"
    return None


def _read_wav_float32(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        if w.getframerate() != SAMPLE_RATE or w.getnchannels() != 1:
            raise RuntimeError("unsupported WAV format")
        pcm = w.readframes(w.getnframes())
    return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0


def _retranscribe_job(
    mid: str,
    wav: Path,
    language: str | None,
    model_name: str | None,
    initial_prompt: str | None,
    translate: bool = False,
) -> None:
    try:
        model = whisper.get(model_name)
        audio = _read_wav_float32(wav)
        segments, info = model.transcribe(
            audio,
            language=language,
            initial_prompt=_effective_prompt(model_name, initial_prompt) or None,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            condition_on_previous_text=False,
            no_speech_threshold=STT_NO_SPEECH_THRESH,
        )
        utterances: list[dict] = []
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            # Same hallucination suppression as the streaming side (drop low-confidence + block canned phrases).
            if (
                getattr(seg, "no_speech_prob", 0.0) >= STT_NO_SPEECH_THRESH
                and getattr(seg, "avg_logprob", 0.0) <= STT_LOGPROB_THRESH
            ):
                continue
            if _normalize(text) in HALLUCINATION_PHRASES:
                continue
            item = {"start": round(seg.start, 2), "end": round(seg.end, 2), "text": text}
            # Translation is CPU-side, so it can run right alongside the GPU transcription.
            if translate:
                ja = translate_to_ja(text, getattr(info, "language", None))
                if ja:
                    item["translation"] = ja
            utterances.append(item)

        p = _rec_paths(mid)
        p["seg"].write_text(
            json.dumps(
                [{"start": u["start"], "end": u["end"]} for u in utterances], ensure_ascii=False
            ),
            encoding="utf-8",
        )
        p["spk"].unlink(missing_ok=True)
        p["emb"].unlink(missing_ok=True)
        with _DIA_LOCK:
            _DIA_JOBS.pop(mid, None)
        with _TR_LOCK:
            _TR_JOBS[mid] = {"status": "done", "utterances": utterances}
    except Exception as e:  # noqa: BLE001
        with _TR_LOCK:
            _TR_JOBS[mid] = {"status": "error", "detail": str(e)[-300:]}
    finally:
        # After re-transcription, minutes regeneration (Ollama) is expected to follow, so return the VRAM.
        whisper.release()


@app.post("/transcribe/{meeting_id}")
async def transcribe_start(meeting_id: str, request: Request) -> dict:
    """Start re-transcription of a saved recording in the background.

    body (JSON, optional): {"language": "auto|ja|en", "model": "...", "initialPrompt": "..."}
    Check progress via GET /transcribe/{id}/status."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    wav = RECORDINGS_DIR / f"{mid}.wav"
    if not wav.exists():
        raise HTTPException(status_code=404, detail="Recording not found (meeting not yet saved, or already deleted)")

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    lang = body.get("language") if isinstance(body, dict) else None
    language = None if lang in (None, "", "auto") else str(lang)
    model_name = body.get("model") if isinstance(body, dict) else None
    ip = body.get("initialPrompt") if isinstance(body, dict) else None
    initial_prompt = str(ip).strip() or None if ip else None
    translate = bool(body.get("translate")) if isinstance(body, dict) else False

    # Global GPU lock: don't start if another meeting's GPU job is running.
    reason = _gpu_busy_other(mid)
    if reason:
        raise HTTPException(status_code=409, detail=reason)

    with _TR_LOCK:
        cur = _TR_JOBS.get(mid)
        if cur and cur.get("status") == "running":
            return {"status": "running"}
        _TR_JOBS[mid] = {"status": "running"}
    threading.Thread(
        target=_retranscribe_job,
        args=(mid, wav, language, model_name, initial_prompt, translate),
        daemon=True,
    ).start()
    return {"status": "running"}


@app.get("/transcribe/{meeting_id}/status")
async def transcribe_status(meeting_id: str) -> dict:
    """State of the re-transcription job. When done, includes utterances (an array of start/end/text)."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    with _TR_LOCK:
        job = _TR_JOBS.get(mid)
    if not job:
        return {"status": "none"}
    return {"status": job["status"], **{k: job[k] for k in ("utterances", "detail") if k in job}}


@app.post("/upload/{meeting_id}")
async def upload_recording(
    meeting_id: str,
    request: Request,
    language: str | None = None,
    model: str | None = None,
    initialPrompt: str | None = None,  # noqa: N803  query name mirrors the JSON field elsewhere
    translate: bool = False,
) -> dict:
    """Accept an uploaded audio file (raw body, any format), save it as the meeting recording,
    and start transcription. Lets a meeting be created from an existing recording, skipping live
    capture. faster-whisper decodes many formats (wav/mp3/m4a/...) via ffmpeg, so no extension
    is needed. Progress is polled via GET /transcribe/{id}/status, same as re-transcription."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="empty upload")

    # Global GPU lock: don't start if another meeting's GPU job is running.
    with _TR_LOCK:
        cur = _TR_JOBS.get(mid)
        if cur and cur.get("status") == "running":
            return {"status": "running"}
    reason = _gpu_busy_other(mid)
    if reason:
        raise HTTPException(status_code=409, detail=reason)

    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    p = _rec_paths(mid)
    src = RECORDINGS_DIR / f"{mid}.upload"
    src.write_bytes(data)
    try:
        from faster_whisper.audio import decode_audio

        audio = decode_audio(str(src), sampling_rate=SAMPLE_RATE)  # float32 mono 16k
    except Exception as e:  # noqa: BLE001
        src.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not read the audio: {str(e)[-200:]}")
    finally:
        src.unlink(missing_ok=True)

    if audio is None or len(audio) < SAMPLE_RATE // 2:  # < 0.5s
        raise HTTPException(status_code=400, detail="Audio too short")

    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    with wave.open(str(p["wav"]), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)
    # New recording: drop any stale boundaries/diarization from a previous upload.
    p["seg"].unlink(missing_ok=True)
    p["spk"].unlink(missing_ok=True)
    p["emb"].unlink(missing_ok=True)
    with _DIA_LOCK:
        _DIA_JOBS.pop(mid, None)

    lang = None if language in (None, "", "auto") else str(language)
    ip = str(initialPrompt).strip() or None if initialPrompt else None
    with _TR_LOCK:
        _TR_JOBS[mid] = {"status": "running"}
    threading.Thread(
        target=_retranscribe_job,
        args=(mid, p["wav"], lang, model, ip, translate),
        daemon=True,
    ).start()
    return {"status": "running"}


@app.post("/voiceprint")
async def voiceprint_extract(request: Request) -> dict:
    """Extract one voice embedding (voiceprint) from an uploaded single-speaker clip.

    Used by the settings screen to enroll a profile: the browser records ~20-60s of
    guided reading and posts the audio here. Runs the diarization pipeline (GPU) with
    num_speakers=1, so the global GPU lock applies."""
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="empty upload")
    if not _DIA_PYTHON.exists() or not _DIA_SCRIPT.exists():
        raise HTTPException(status_code=500, detail="Diarization environment not found")
    reason = _gpu_busy_other("__voiceprint__")
    if reason:
        raise HTTPException(status_code=409, detail=reason)

    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    src = RECORDINGS_DIR / "__voiceprint__.upload"
    tmp = RECORDINGS_DIR / "__voiceprint__.wav"
    src.write_bytes(data)
    try:
        from faster_whisper.audio import decode_audio

        audio = decode_audio(str(src), sampling_rate=SAMPLE_RATE)  # float32 mono 16k
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read the audio: {str(e)[-200:]}")
    finally:
        src.unlink(missing_ok=True)

    seconds = len(audio) / SAMPLE_RATE if audio is not None else 0.0
    if seconds < 5:
        raise HTTPException(status_code=400, detail="Clip too short — record at least 5 seconds")
    if seconds > 180:
        raise HTTPException(status_code=400, detail="Clip too long — keep it under 3 minutes")

    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)

    def _run() -> list[float]:
        env = dict(os.environ)
        env.setdefault("DIA_DEVICE", "cuda")
        env["PYTHONIOENCODING"] = "utf-8"
        proc = subprocess.run(
            [str(_DIA_PYTHON), str(_DIA_SCRIPT), "--embed", str(tmp)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=env,
        )
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "").strip()[-300:] or "embed failed")
        lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip()]
        payload = json.loads(lines[-1]) if lines else {}
        vec = payload.get("embedding")
        if not isinstance(vec, list) or not vec:
            raise RuntimeError(payload.get("error") or "no embedding returned")
        return vec

    try:
        embedding = await asyncio.to_thread(_run)
    except Exception as e:  # noqa: BLE001
        # Enrolment loads the same gated pyannote model diarization does, so it hits the same
        # wall on a tokenless install — say so instead of returning the traceback tail.
        if _needs_hf_token(str(e)):
            raise HTTPException(
                status_code=503,
                detail="Voice profiles need a Hugging Face token. See Setup -> Diarization needs a Hugging Face token.",
            )
        raise HTTPException(status_code=500, detail=f"Voiceprint extraction failed: {str(e)[-300:]}")
    finally:
        tmp.unlink(missing_ok=True)

    return {"embedding": embedding, "seconds": round(seconds, 1)}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    # WebSockets are exempt from CORS, so the browser would happily let any site open a
    # recording session here. Apply the same origin rule as the HTTP endpoints.
    if not _origin_allowed(ws.headers.get("origin")):
        await ws.close(code=1008)  # policy violation
        return
    await ws.accept()
    _touch_activity(delta_ws=+1)
    state = StreamState()
    started = False
    saved = False  # whether the recording was saved (via end, or the disconnect fallback)

    silence_limit = int(SAMPLE_RATE * VAD_SILENCE_MS / 1000)
    max_seg = int(SAMPLE_RATE * VAD_MAX_SEGMENT_MS / 1000)
    min_seg = int(SAMPLE_RATE * VAD_MIN_SEGMENT_MS / 1000)
    frame = int(SAMPLE_RATE * 0.02)  # silence detection in 20ms units
    partial_gap = int(SAMPLE_RATE * STT_PARTIAL_MS / 1000)

    # Serializes GPU inference for this connection: a final and a partial must never run
    # concurrently, and finals have priority (partials skip instead of queueing).
    transcribe_lock = asyncio.Lock()
    partial_task: asyncio.Task | None = None
    last_partial_sample = 0
    # In-flight CPU translations, awaited briefly at meeting end so late ones still arrive.
    translation_tasks: set[asyncio.Task] = set()

    async def send_partial(audio: np.ndarray) -> None:
        """Provisional transcription of the segment still being spoken (best-effort).

        Greedy decoding (beam_size=1) keeps it cheap; the text is replaced by the accurate
        final when the segment closes. Any failure is swallowed — partials are disposable.
        """
        if transcribe_lock.locked():
            return  # a final (or another partial) is on the GPU; the next chunk retries
        try:
            async with transcribe_lock:
                model = whisper.get(state.model_name)
                text = await asyncio.to_thread(
                    transcribe_segment,
                    model,
                    audio,
                    state.language,
                    state.initial_prompt,
                    beam_size=1,
                )
            if text:
                await ws.send_text(json.dumps({"type": "partial", "text": text}, ensure_ascii=False))
        except Exception:  # noqa: BLE001
            pass

    async def send_translation(seq: int, text: str, detected: str | None) -> None:
        """Translate one finalized utterance into Japanese and send it under its seq.

        On the CPU, so it can run while Whisper has the GPU. Best-effort: a failed or
        unsupported translation simply never arrives and the original text stands alone.
        """
        try:
            ja = await asyncio.to_thread(translate_to_ja, text, detected)
            if ja:
                await ws.send_text(
                    json.dumps({"type": "translation", "seq": seq, "text": ja}, ensure_ascii=False)
                )
        except Exception:  # noqa: BLE001
            pass

    async def flush_segment() -> None:
        """Finalize the current buffer as one utterance and send a final."""
        # Snapshot and reset immediately so the next segment accumulates while Whisper runs.
        audio = state.buffer
        start_sample = state.seg_start_sample
        state.buffer = np.zeros(0, dtype=np.float32)
        state.silence_samples = 0
        state.seg_start_sample = state.elapsed_samples
        # Pass to Whisper only when voiced time is above the threshold.
        # Not passing silent buffers (produced at each silence split) cuts off hallucinations.
        if audio.size >= min_seg and voiced_ms(audio, frame) >= VAD_MIN_SPEECH_MS:
            # Inference runs on a thread so the event loop (this receive loop for queued
            # frames, /health, other connections) stays responsive during the ~seconds it takes.
            async with transcribe_lock:
                model = whisper.get(state.model_name)
                text, detected = await asyncio.to_thread(
                    transcribe_segment_ex, model, audio, state.language, state.initial_prompt
                )
            if text:
                start_s = start_sample / SAMPLE_RATE
                end_s = (start_sample + audio.size) / SAMPLE_RATE
                seq = state.seq
                state.seq += 1
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "final",
                            "text": text,
                            "speaker": "spk",
                            "seq": seq,
                            "start": round(start_s, 2),
                            "end": round(end_s, 2),
                        },
                        ensure_ascii=False,
                    )
                )
                # Record finalized-utterance times in save order, to map utterances to times during diarization.
                # Recording only after a successful send prevents an utterance that never reached the client
                # from remaining only in segments.json and shifting the numbering vs the DB utterances.
                state.finals.append({"start": round(start_s, 2), "end": round(end_s, 2)})
                # Translation runs on the CPU and lands separately, keyed by seq — the
                # transcript must never wait on it.
                if state.translate:
                    task = asyncio.create_task(send_translation(seq, text, detected))
                    translation_tasks.add(task)
                    task.add_done_callback(translation_tasks.discard)
            else:
                # The segment produced no final (filtered as noise/hallucination) — clear any
                # partial that was shown for it, or stale text lingers until the next final.
                with suppress(Exception):
                    await ws.send_text(json.dumps({"type": "partial", "text": ""}))

    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break

            text = msg.get("text")
            if text is not None:
                try:
                    payload = json.loads(text)
                except json.JSONDecodeError:
                    continue
                kind = payload.get("type")
                if kind == "start":
                    state.model_name = payload.get("model")
                    state.meeting_id = _safe_meeting_id(payload.get("meetingId"))
                    if state.meeting_id:
                        _recording_add(state.meeting_id)  # for /activity (list "Recording…")
                    lang = payload.get("language")
                    state.language = None if lang in (None, "", "auto") else str(lang)
                    ip = payload.get("initialPrompt")
                    state.initial_prompt = _effective_prompt(
                        state.model_name, (str(ip).strip() or None) if ip else None
                    )
                    state.translate = bool(payload.get("translate"))
                    # Resuming a meeting, or reconnecting after a drop, appends to the existing
                    # WAV. Start this session's clock at the end of that audio so every timestamp
                    # is an offset into the finished recording rather than into this session —
                    # the web app stores these on the utterance and seeks the player with them.
                    if state.meeting_id:
                        prior = _existing_recording_samples(state.meeting_id)
                        state.elapsed_samples = prior
                        state.seg_start_sample = prior
                    started = True
                    await ws.send_text(json.dumps({"type": "status", "status": "loading"}))
                    # Model load can take tens of seconds, so run it on a separate thread
                    # to keep the event loop (/health and other connections) alive during load.
                    # On failure, tell the client the reason before closing (no silent disconnect).
                    try:
                        await asyncio.to_thread(whisper.get, state.model_name)
                    except Exception as e:  # noqa: BLE001
                        with suppress(Exception):
                            await ws.send_text(
                                json.dumps(
                                    {"type": "error", "message": f"Model load failed: {e}"},
                                    ensure_ascii=False,
                                )
                            )
                        break
                    await ws.send_text(json.dumps({"type": "status", "status": "open"}))
                elif kind == "end":
                    # Even if the client disconnects while transcribing the final segment
                    # (even if send fails), always proceed to saving the recording.
                    try:
                        await flush_segment()
                    except Exception:  # noqa: BLE001
                        pass
                    # Let queued translations finish so the last lines are not left untranslated.
                    # Bounded, because the client only waits ~10s for "closed" before closing.
                    if translation_tasks:
                        with suppress(Exception):
                            await asyncio.wait(set(translation_tasks), timeout=8)
                    whisper.release()  # free VRAM -> yield to Ollama
                    # Save the meeting audio and utterance boundaries for diarization (only when meetingId is set).
                    if state.meeting_id:
                        try:
                            save_recording(state.meeting_id, state.full_audio, state.finals)
                            saved = True
                        except Exception as e:  # noqa: BLE001  a save failure must not block meeting end
                            with suppress(Exception):
                                await ws.send_text(
                                    json.dumps({"type": "error", "message": f"Failed to save recording: {e}"})
                                )
                    with suppress(Exception):
                        await ws.send_text(json.dumps({"type": "status", "status": "closed"}))
                    break
                continue

            data = msg.get("bytes")
            if data is None or not started:
                continue

            samples = pcm16_to_float32(data)
            state.buffer = np.concatenate([state.buffer, samples])
            state.elapsed_samples += samples.size
            # Keep all audio for post-meeting diarization (only when meetingId is set).
            if state.meeting_id:
                state.full_audio.append(samples)

            # Judge silence/speech from the energy of the trailing frame
            tail = state.buffer[-frame:] if state.buffer.size >= frame else state.buffer
            if rms(tail) < VAD_ENERGY_THRESH:
                state.silence_samples += samples.size
            else:
                state.silence_samples = 0

            # Split and finalize when silence continues or the max length is exceeded
            if state.buffer.size >= max_seg or (
                state.silence_samples >= silence_limit and state.buffer.size >= min_seg
            ):
                last_partial_sample = state.elapsed_samples
                await flush_segment()
            elif (
                # Otherwise, periodically show what the in-progress segment sounds like so
                # far — without this, continuous speech shows nothing until the segment
                # closes (up to VAD_MAX_SEGMENT_MS), which reads as a hang.
                STT_PARTIAL_MS > 0
                and state.buffer.size >= SAMPLE_RATE  # at least 1s of audio to work with
                and state.elapsed_samples - last_partial_sample >= partial_gap
                and (partial_task is None or partial_task.done())
                and not transcribe_lock.locked()
                and voiced_ms(state.buffer, frame) >= VAD_MIN_SPEECH_MS
            ):
                last_partial_sample = state.elapsed_samples
                partial_task = asyncio.create_task(send_partial(state.buffer.copy()))
    except WebSocketDisconnect:
        pass
    finally:
        if partial_task is not None and not partial_task.done():
            partial_task.cancel()
        for t in list(translation_tasks):
            if not t.done():
                t.cancel()
        # Do not release the model here. Releasing on every disconnect would destroy the
        # loaded model as reconnects or concurrent connections come and go, causing an endless
        # "loading" state. Leave release to explicit end (meeting end) and the idle timer.
        _touch_activity(delta_ws=-1)
        if state.meeting_id:
            _recording_remove(state.meeting_id)
        # If disconnected without end arriving (network drop, screen lock, an early client
        # close, etc.), still save the audio so far so it can be used for diarization.
        # A re-recording of the same meeting is appended.
        if state.meeting_id and not saved and state.full_audio:
            try:
                save_recording(state.meeting_id, state.full_audio, state.finals)
            except Exception:  # noqa: BLE001  swallow failures during cleanup
                pass


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("STT_HOST", "0.0.0.0")
    port = int(os.environ.get("STT_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
