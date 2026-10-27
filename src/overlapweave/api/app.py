"""FastAPI REST service exposing OverlapWeave pipeline and research endpoints."""

from __future__ import annotations
import io
import os
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from overlapweave import __version__
from overlapweave.pipeline import OverlapWeavePipeline
from overlapweave.schemas.models import PipelineResult, BenchmarkReport
from overlapweave.audio.processor import AudioProcessor
from overlapweave.evaluation.harness import BenchmarkHarness
from overlapweave.evaluation.synthetic_generator import SyntheticDatasetGenerator

app = FastAPI(
    title="OverlapWeave API",
    description="Benefit-Aware Adaptive Speech Separation for Speaker-Attributed ASR in Overlapping Tamil–English Conversations",
    version=__version__
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Singleton pipeline instance
_pipeline: Optional[OverlapWeavePipeline] = None


def get_pipeline() -> OverlapWeavePipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = OverlapWeavePipeline()
    return _pipeline


@app.get("/api/health")
async def health_check():
    """Returns system status, package versions, and hardware backend."""
    import torch
    return {
        "status": "healthy",
        "version": __version__,
        "torch_version": torch.__version__,
        "mps_available": torch.backends.mps.is_available(),
        "default_models": {
            "asr": "faster-whisper-tiny",
            "separation": "ConvTasNet-Libri2Mix",
            "languages": ["ta", "en"]
        }
    }


@app.post("/api/transcribe", response_model=PipelineResult)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    include_audio: bool = Form(True)
):
    """Processes uploaded audio file through the complete OverlapWeave adaptive pipeline."""
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        pipeline = get_pipeline()
        # Set language override if provided
        pipeline.language = language if language and language != "auto" else None

        result = pipeline.process_audio(contents, include_separated_audio=include_audio)
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)}")


@app.post("/api/overlap")
async def detect_overlap_only(file: UploadFile = File(...)):
    """Runs only acoustic overlap detection on uploaded audio."""
    try:
        contents = await file.read()
        audio, metadata = AudioProcessor.load_audio(contents)
        pipeline = get_pipeline()
        overlaps = pipeline.overlap_detector.detect_overlaps(audio, sr=16000)
        return {
            "metadata": metadata,
            "overlaps": overlaps
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/benchmarks")
async def get_benchmarks():
    """Retrieves saved benchmark results or triggers initial run if none exist."""
    results_file = "results/benchmarks.json"
    if os.path.exists(results_file):
        try:
            with open(results_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # If no results cached, run benchmark on test split
    harness = BenchmarkHarness()
    report = harness.run_benchmark(save_results=True)
    return report.model_dump()


@app.post("/api/run-benchmarks")
async def run_benchmarks_now():
    """Triggers complete benchmark suite evaluation."""
    try:
        harness = BenchmarkHarness()
        report = harness.run_benchmark(save_results=True)
        return report.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark run failed: {str(e)}")


@app.get("/api/sample-audio/{sample_id}")
async def get_sample_audio(sample_id: str):
    """Provides pre-synthesized conversational samples for one-click demo testing."""
    dataset = SyntheticDatasetGenerator.get_dataset(split="test")
    match = next((s for s in dataset if s["id"] == sample_id), None)
    if not match:
        # Fallback to first available sample
        match = dataset[0]

    wav_bytes = AudioProcessor.audio_to_wav_bytes(match["mixture_audio"])
    return Response(content=wav_bytes, media_type="audio/wav")


@app.get("/api/sample-metadata")
async def get_sample_metadata():
    """Returns list of available built-in demonstration samples."""
    return SyntheticDatasetGenerator.CONVERSATIONAL_SEEDS
