# STT service (FastAPI + faster-whisper) and the diarization worker.
#
# Both live in one image because server.py launches diarize.py as a subprocess using the
# interpreter at <repo root>/diarization/.venv/bin/python. Keeping the repo layout inside the
# container means that path resolves exactly as it does on a native install — no code changes.
#
# The two venvs stay separate on purpose: the STT venv holds CTranslate2, the diarization venv
# holds a CUDA build of torch, and mixing them has produced conflicting CUDA runtimes before.
#
# Needs the NVIDIA Container Toolkit on the host; see docs/setup.md.

# cuDNN 9 is required by CTranslate2 4.x on CUDA 12.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Ubuntu 22.04 ships Python 3.10; the project targets 3.11.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends software-properties-common ca-certificates gnupg \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update -qq \
    && apt-get install -y --no-install-recommends \
        python3.11 python3.11-venv python3.11-dev \
        ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- STT venv -------------------------------------------------------------------------
COPY stt-service/requirements.txt /app/stt-service/requirements.txt
RUN python3.11 -m venv /app/stt-service/.venv \
    && /app/stt-service/.venv/bin/pip install --upgrade pip \
    && /app/stt-service/.venv/bin/pip install -r /app/stt-service/requirements.txt

# --- Diarization venv (CUDA torch + pyannote) -----------------------------------------
# pyannote.audio 4.x needs torch>=2.8, which is cu128 and up.
COPY diarization/requirements.txt /app/diarization/requirements.txt
RUN python3.11 -m venv /app/diarization/.venv \
    && /app/diarization/.venv/bin/pip install --upgrade pip \
    && /app/diarization/.venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128 \
    && /app/diarization/.venv/bin/pip install -r /app/diarization/requirements.txt

# Source last so dependency layers stay cached across code edits.
COPY stt-service/ /app/stt-service/
COPY diarization/ /app/diarization/

# Recordings and the Hugging Face model cache are volumes in compose — without the cache
# volume, every restart re-downloads several GB of model weights.
ENV STT_RECORDINGS_DIR=/data/recordings \
    HF_HOME=/data/huggingface \
    WHISPER_DEVICE=cuda \
    STT_HOST=0.0.0.0 \
    STT_PORT=8000
RUN mkdir -p /data/recordings /data/huggingface

EXPOSE 8000
WORKDIR /app/stt-service
CMD ["/app/stt-service/.venv/bin/python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
