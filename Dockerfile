# Routone API (FastAPI + faster-whisper + ConvTasNet), CPU only.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf \
    TORCH_HOME=/opt/torch \
    WEB_CONCURRENCY=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch wheels keep the image small (the default Linux wheel bundles CUDA).
RUN pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY pyproject.toml README.md LICENSE ./
COPY src ./src
# Editable install keeps the package under /app/src, which the code uses to locate data/ and results/.
RUN pip install -e .

# Bake model weights into the image so the first request does not download them.
RUN python -c "from faster_whisper import WhisperModel; [WhisperModel(s, device='cpu', compute_type='int8') for s in ('tiny', 'base')]" \
    && python -c "import torchaudio; torchaudio.pipelines.CONVTASNET_BASE_LIBRI2MIX.get_model()"

COPY results ./results
RUN mkdir -p data/runs data/demo_samples

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn routone.api.app:app --host 0.0.0.0 --port ${PORT}"]
