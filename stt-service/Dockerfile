# STT service (FastAPI + faster-whisper) and the diarization worker.
#
# Both live in one image because server.py launches diarize.py as a subprocess using the
# interpreter at <repo root>/diarization/.venv/bin/python. Keeping the repo layout inside the
# container means that path resolves exactly as it does on a native install — no code changes.
#
# The two venvs stay separate on purpose: the STT venv holds CTranslate2 and the diarization
# venv holds ONNX Runtime and (on CUDA builds) torch, and mixing their native dependencies has
# caused conflicts before.
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

# --- Diarization venv -----------------------------------------------------------------
# Both backends go in, and diarize.py picks between them from the hardware: pyannote when
# there is a CUDA device, sherpa-onnx otherwise. v2.0.0-beta.1 shipped sherpa-onnx alone and
# regressed badly on long meetings (a 49-minute three-person recording came back as one
# speaker), so the accurate backend is back for the machines that can run it.
#
# pyannote is what makes this image large: torch, torchaudio and torchcodec from the CUDA 12.8
# index are several gigabytes, against tens of megabytes for ONNX Runtime. Build with
# --build-arg WITH_PYANNOTE=0 for a CPU-only host: sherpa-onnx is the only backend that would
# be selected there anyway, and dropping torch takes most of the image with it.
ARG WITH_PYANNOTE=1
COPY diarization/requirements.txt diarization/requirements-pyannote.txt /app/diarization/
RUN python3.11 -m venv /app/diarization/.venv \
    && /app/diarization/.venv/bin/pip install --upgrade pip \
    && /app/diarization/.venv/bin/pip install -r /app/diarization/requirements.txt \
    && if [ "$WITH_PYANNOTE" = "1" ]; then \
         /app/diarization/.venv/bin/pip install torch torchaudio torchcodec \
             --index-url https://download.pytorch.org/whl/cu128 \
         && /app/diarization/.venv/bin/pip install -r /app/diarization/requirements-pyannote.txt; \
       fi

# Source last so dependency layers stay cached across code edits.
COPY stt-service/ /app/stt-service/
COPY diarization/ /app/diarization/

# The two ONNX models, baked in rather than fetched on first use: ~33 MB together, and a
# diarization that works offline beats one that needs the network at the wrong moment.
RUN /app/diarization/.venv/bin/python /app/diarization/fetch_models.py

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
