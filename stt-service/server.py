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
    {"type":"final","text":...,"speaker":"spk","start":s,"end":s}  finalized utterance
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


def _touch_activity(delta_ws: int = 0) -> None:
    global _ACTIVE_WS, _LAST_ACTIVITY
    with _ACT_LOCK:
        _ACTIVE_WS += delta_ws
        _LAST_ACTIVITY = time.time()


def _preload_model(name: str | None) -> None:
    """Load the model in the background (failures go to the log)."""
    try:
        whisper.get(name)
        print(f"[preload] loaded model: {whisper.loaded_model}")
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
        threading.Thread(target=_preload_model, args=(None,), daemon=True).start()
    yield
    cleanup_task.cancel()
    idle_task.cancel()


app = FastAPI(title="Voxinq2 STT", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


def transcribe_segment(
    model,
    audio: np.ndarray,
    language: str | None = None,
    initial_prompt: str | None = None,
) -> str:
    """Transcribe a single utterance segment (float32 mono 16k) and return the joined text.

    language=None auto-detects the spoken language ("ja"/"en" pins it).
    Passing a glossary as initial_prompt biases recognition toward proper nouns, etc.
    Suppresses silence-derived hallucinations in three stages:
      - remove non-speech regions with Whisper's built-in VAD (silero)
      - discard low-confidence segments by no_speech_prob / avg_logprob
      - blocklist of known canned phrases
    """
    segments, _info = model.transcribe(
        audio,
        language=language,
        initial_prompt=initial_prompt or None,
        beam_size=5,
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
    return "".join(out).strip()


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


def save_recording(meeting_id: str, chunks: list[np.ndarray], finals: list[dict]) -> None:
    """Save the meeting audio (WAV) and finalized-utterance boundaries (JSON) on this PC.

    So a meeting split across multiple recording sessions still maps to its utterances,
    it **appends to the existing recording** instead of overwriting (new-session times are
    offset by the existing length). When the recording changes, cached diarization results are invalidated.
    """
    if not chunks:
        return
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = RECORDINGS_DIR / f"{meeting_id}.wav"
    seg_path = RECORDINGS_DIR / f"{meeting_id}.segments.json"
    spk_path = RECORDINGS_DIR / f"{meeting_id}.speakers.json"

    audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
    new_pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()

    # If an existing recording is present, read it to prepend and compute the time offset.
    prev_pcm = b""
    prev_finals: list[dict] = []
    offset_sec = 0.0
    if wav_path.exists() and seg_path.exists():
        try:
            with wave.open(str(wav_path), "rb") as w:
                if w.getframerate() == SAMPLE_RATE and w.getnchannels() == 1:
                    prev_pcm = w.readframes(w.getnframes())
                    offset_sec = w.getnframes() / SAMPLE_RATE
            prev_finals = json.loads(seg_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001  if corrupted, treat as new
            prev_pcm, prev_finals, offset_sec = b"", [], 0.0

    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(prev_pcm + new_pcm)

    adjusted = [
        {"start": round(f["start"] + offset_sec, 2), "end": round(f["end"] + offset_sec, 2)}
        for f in finals
    ]
    seg_path.write_text(json.dumps(prev_finals + adjusted, ensure_ascii=False), encoding="utf-8")

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
    }


@app.post("/preload")
async def preload(model: str | None = None) -> dict:
    """Preload the Whisper model in the background.

    Loading takes tens of seconds, so call this when the recording page opens to warm it up.
    If already loaded, returns ready immediately."""
    name = model or DEFAULT_MODEL
    _touch_activity()
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
    # Start seconds of the first utterance within the WAV. Used to map transcript elapsed time -> playback position.
    first_start = 0.0
    try:
        segs = json.loads(p["seg"].read_text(encoding="utf-8"))
        if isinstance(segs, list) and segs and isinstance(segs[0], dict):
            first_start = float(segs[0].get("start", 0.0))
    except Exception:  # noqa: BLE001
        pass
    return {
        "exists": True,
        "protected": protected,
        "expiresAt": expires,
        "sizeBytes": st.st_size,
        "firstUtteranceStart": round(first_start, 2),
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


@app.get("/recordings/{meeting_id}")
async def recording_info(meeting_id: str) -> dict:
    """Return whether a recording exists, its protection state, and the auto-deletion schedule."""
    mid = _safe_meeting_id(meeting_id)
    if not mid:
        raise HTTPException(status_code=400, detail="invalid meeting id")
    return _recording_state(mid)


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


def _run_diarizer(wav_path: Path, seg_path: Path, num_speakers: int | None) -> dict:
    """Run diarize.py in the diarization venv as a subprocess.

    Returns {"speakers": [...], "embeddings": {label: [float,...]}} — per-utterance
    speaker labels plus per-speaker voice embeddings (may be missing/empty)."""
    env = dict(os.environ)
    # Diarization runs after the meeting when Whisper is already released, so default to GPU (cuda).
    # Override via the DIA_DEVICE env var (can fall back to cpu).
    env.setdefault("DIA_DEVICE", "cuda")
    env["PYTHONIOENCODING"] = "utf-8"
    if num_speakers:
        env["DIA_NUM_SPEAKERS"] = str(num_speakers)
    proc = subprocess.run(
        [str(_DIA_PYTHON), str(_DIA_SCRIPT), str(wav_path), str(seg_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "").strip()[-500:] or "diarize failed")
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip()]
    if not lines:
        raise RuntimeError("diarizer returned no output")
    payload = json.loads(lines[-1])
    return {"speakers": payload["speakers"], "embeddings": payload.get("embeddings") or {}}


# Diarization can take several to a dozen-plus minutes on CPU (~0.5x the audio length).
# Synchronous HTTP would time out in the browser/proxy, so use a background job + polling.
_DIA_LOCK = threading.Lock()
_DIA_JOBS: dict[str, dict] = {}  # meeting_id -> {"status": running|done|error, "speakers"?, "detail"?}


def _diarize_job(mid: str, wav: Path, seg: Path, num_speakers: int | None) -> None:
    try:
        result = _run_diarizer(wav, seg, num_speakers)
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
        with _DIA_LOCK:
            _DIA_JOBS[mid] = {"status": "error", "detail": str(e)[-300:]}


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
) -> None:
    try:
        model = whisper.get(model_name)
        audio = _read_wav_float32(wav)
        segments, _info = model.transcribe(
            audio,
            language=language,
            initial_prompt=initial_prompt or None,
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
            utterances.append(
                {"start": round(seg.start, 2), "end": round(seg.end, 2), "text": text}
            )

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
        args=(mid, wav, language, model_name, initial_prompt),
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
        args=(mid, p["wav"], lang, model, ip),
        daemon=True,
    ).start()
    return {"status": "running"}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    _touch_activity(delta_ws=+1)
    state = StreamState()
    started = False
    saved = False  # whether the recording was saved (via end, or the disconnect fallback)

    silence_limit = int(SAMPLE_RATE * VAD_SILENCE_MS / 1000)
    max_seg = int(SAMPLE_RATE * VAD_MAX_SEGMENT_MS / 1000)
    min_seg = int(SAMPLE_RATE * VAD_MIN_SEGMENT_MS / 1000)
    frame = int(SAMPLE_RATE * 0.02)  # silence detection in 20ms units

    async def flush_segment() -> None:
        """Finalize the current buffer as one utterance and send a final."""
        audio = state.buffer
        # Pass to Whisper only when voiced time is above the threshold.
        # Not passing silent buffers (produced at each silence split) cuts off hallucinations.
        if audio.size >= min_seg and voiced_ms(audio, frame) >= VAD_MIN_SPEECH_MS:
            model = whisper.get(state.model_name)
            text = transcribe_segment(model, audio, state.language, state.initial_prompt)
            if text:
                start_s = state.seg_start_sample / SAMPLE_RATE
                end_s = (state.seg_start_sample + audio.size) / SAMPLE_RATE
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "final",
                            "text": text,
                            "speaker": "spk",
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
        state.buffer = np.zeros(0, dtype=np.float32)
        state.silence_samples = 0
        state.seg_start_sample = state.elapsed_samples

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
                    lang = payload.get("language")
                    state.language = None if lang in (None, "", "auto") else str(lang)
                    ip = payload.get("initialPrompt")
                    state.initial_prompt = (str(ip).strip() or None) if ip else None
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
                await flush_segment()
    except WebSocketDisconnect:
        pass
    finally:
        # Do not release the model here. Releasing on every disconnect would destroy the
        # loaded model as reconnects or concurrent connections come and go, causing an endless
        # "loading" state. Leave release to explicit end (meeting end) and the idle timer.
        _touch_activity(delta_ws=-1)
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
