"""FastAPI REST service exposing the Routone pipeline and research endpoints."""

from __future__ import annotations
import csv
import io
import json
import mimetypes
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from routone import __version__
from routone.pipeline import RoutonePipeline
from routone.schemas.models import PipelineResult, BenchmarkReport, RoutingDecision
from routone.asr.whisper_engine import WhisperASREngine
from routone.separation.separator import ConvTasNetSeparator
from routone.routing.policies import STRATEGIES, build_controller, replay_decisions, benefit_aware_spec
from routone.runs import RunStore
from routone.audio.processor import AudioProcessor
from routone.evaluation.harness import BenchmarkHarness
from routone.evaluation.synthetic_generator import SyntheticDatasetGenerator

app = FastAPI(
    title="Routone API",
    description="Benefit-Aware Adaptive Speech Separation for Speaker-Attributed ASR in Overlapping Tamil–English Conversations",
    version=__version__
)

# Enable CORS for frontend development
# ROUTONE_CORS_ORIGINS: comma-separated origins allowed to call the API (default: any). No cookies are used.
_cors_origins = [o.strip() for o in os.environ.get("ROUTONE_CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "demo_samples"
RESULTS_DIR = Path("results")
run_store = RunStore()

# Singleton pipeline instance
_pipeline: Optional[RoutonePipeline] = None


def get_pipeline() -> RoutonePipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RoutonePipeline()
    return _pipeline


def _hf_model_cached(size: str) -> bool:
    hub = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub"
    return (hub / f"models--Systran--faster-whisper-{size}").exists()


def _separator_weights_cached() -> bool:
    import torch
    return (Path(torch.hub.get_dir()) / "torchaudio" / "models" / "conv_tasnet_base_libri2mix.pt").exists()


@app.get("/api/health")
async def health_check():
    """Returns system status, package versions, and *observed* runtime state of the models.

    ``default_models`` is kept for backward compatibility and is a configuration default, not a
    verification. Use ``runtime`` for what is actually loaded.
    """
    import torch
    asr = WhisperASREngine._instance
    sep = ConvTasNetSeparator._instance
    return {
        "status": "healthy",
        "version": __version__,
        "torch_version": torch.__version__,
        "mps_available": torch.backends.mps.is_available(),
        "default_models": {
            "asr": "faster-whisper-tiny",
            "separation": "ConvTasNet-Libri2Mix",
            "languages": ["ta", "en"]
        },
        "runtime": {
            "asr": {
                "engine": "faster-whisper",
                "model_size": asr.model_size if asr else "tiny",
                "device": asr.device if asr else "cpu",
                "compute_type": asr.compute_type if asr else "int8",
                "loaded": bool(asr and asr.model is not None),
                "available_models": [m for m in WhisperASREngine.SUPPORTED_MODELS if _hf_model_cached(m)],
                "supported_models": list(WhisperASREngine.SUPPORTED_MODELS),
            },
            "separation": {
                "model": "ConvTasNet (torchaudio CONVTASNET_BASE_LIBRI2MIX)",
                "device": str(sep.device) if sep else "cpu",
                "loaded": bool(sep and sep.model is not None),
                "weights_cached": _separator_weights_cached(),
            },
            "accelerator": {"mps_available": torch.backends.mps.is_available(), "mps_used": False},
        },
        "routing": {"strategies": list(STRATEGIES), "benefit_aware": benefit_aware_spec()},
        "demo_available": sorted(p.stem for p in DEMO_DIR.glob("*.wav")) if DEMO_DIR.exists() else [],
    }


@app.post("/api/transcribe", response_model=PipelineResult)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    include_audio: bool = Form(True),
    asr_model: Optional[str] = Form(None),
    vad_filter: bool = Form(True),
    word_timestamps: bool = Form(True),
    routing_strategy: str = Form("benefit_aware"),
    lambda_param: float = Form(0.45),
    threshold: float = Form(0.50),
    persist: bool = Form(True),
):
    """Processes uploaded audio file through the complete adaptive pipeline.

    All settings are optional; the defaults reproduce the previous behaviour.
    """
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if asr_model and asr_model not in WhisperASREngine.SUPPORTED_MODELS:
            raise HTTPException(status_code=400, detail=f"Unsupported ASR model '{asr_model}'.")
        if routing_strategy not in STRATEGIES:
            raise HTTPException(status_code=400, detail=f"Unknown routing strategy '{routing_strategy}'.")

        pipeline = get_pipeline()
        if asr_model:
            pipeline.asr_engine = WhisperASREngine.get_default_engine(asr_model)
        # Set language override if provided
        pipeline.language = language if language and language != "auto" else None
        controller = build_controller(routing_strategy, lambda_param=lambda_param, threshold=threshold)

        result = pipeline.process_audio(
            contents,
            include_separated_audio=include_audio,
            controller_override=controller,
            vad_filter=vad_filter,
            word_timestamps=word_timestamps,
            config={"routing_strategy": routing_strategy, "filename": file.filename},
        )
        if persist:
            try:
                run_store.save(result, file.filename or "recording", contents)
            except OSError:
                result.run_id = None  # history is best-effort; the transcription itself succeeded
        return result
    except HTTPException:
        raise
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)}")


class ReplayPolicy(BaseModel):
    name: str = ""
    strategy: str = "benefit_aware"
    lambda_param: float = Field(default=0.45, ge=0.0, le=5.0)
    threshold: float = Field(default=0.50, ge=0.0, le=1.0)


class ReplayRequest(BaseModel):
    decisions: List[RoutingDecision]
    policies: List[ReplayPolicy]


@app.post("/api/routing/replay")
async def replay_routing(req: ReplayRequest):
    """Re-evaluates routing policies' decision rules on the features stored from a real run.

    This recomputes decisions only; it does not re-run ASR or separation, so no recognition
    outcome is produced for decisions that differ from the original run.
    """
    try:
        return {
            "policies": [
                {
                    "policy": p.model_dump(),
                    "decisions": [d.model_dump() for d in replay_decisions(
                        req.decisions, p.strategy, lambda_param=p.lambda_param, threshold=p.threshold
                    )],
                }
                for p in req.policies
            ]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/runs")
async def list_runs():
    """Lists persisted runs (newest first)."""
    return run_store.list()


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    rec = run_store.get(run_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return rec


@app.get("/api/runs/{run_id}/audio")
async def get_run_audio(run_id: str):
    path = run_store.audio_path(run_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Run audio not found.")
    return FileResponse(path, media_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream")


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
    """Returns the saved benchmark report, or 404 when no benchmark has been run yet."""
    results_file = RESULTS_DIR / "benchmarks.json"
    if not results_file.exists():
        raise HTTPException(status_code=404, detail="No benchmark has been run yet.")
    try:
        return json.loads(results_file.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Saved benchmark report is unreadable: {e}")


@app.get("/api/benchmarks/history")
async def list_benchmark_history():
    """Past benchmark runs (newest first), one summary row each."""
    import re
    out = []
    hist = RESULTS_DIR / "history"
    if hist.exists():
        for f in sorted(hist.glob("bench_*.json"), reverse=True):
            if not re.match(r"^bench_\d{8}T\d{6}$", f.stem):
                continue
            try:
                r = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            out.append({
                "id": f.stem,
                "timestamp": r.get("timestamp"),
                "dataset_name": r.get("dataset_name"),
                "status": r.get("status", "unknown"),
                "strategies": [m["method_name"] for m in r.get("results", [])],
                "samples": (r.get("dataset") or {}).get("samples_evaluated"),
            })
    return out


@app.get("/api/benchmarks/history/{bench_id}")
async def get_benchmark_history(bench_id: str):
    import re
    f = RESULTS_DIR / "history" / f"{bench_id}.json"
    if not re.match(r"^bench_\d{8}T\d{6}$", bench_id) or not f.exists():
        raise HTTPException(status_code=404, detail="Benchmark run not found.")
    return json.loads(f.read_text(encoding="utf-8"))


@app.get("/results/benchmarks.csv")
@app.get("/api/benchmarks.csv")
async def get_benchmarks_csv():
    csv_file = RESULTS_DIR / "benchmarks.csv"
    if not csv_file.exists():
        raise HTTPException(status_code=404, detail="No benchmark has been run yet.")
    return FileResponse(csv_file, media_type="text/csv", filename="benchmarks.csv")


@app.post("/api/run-benchmarks")
async def run_benchmarks_now(
    dataset: str = Query("auto", pattern="^(auto|tts|synthetic)$"),
    lambda_param: float = Query(0.45, ge=0.0, le=5.0),
    threshold: float = Query(0.50, ge=0.0, le=1.0),
):
    """Triggers the benchmark suite. ``dataset``: auto (real-speech TTS mixtures when available), tts, or synthetic."""
    try:
        harness = BenchmarkHarness()
        report = harness.run_benchmark(save_results=True, dataset=dataset, lambda_param=lambda_param, threshold=threshold)
        return report.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark run failed: {str(e)}")


@app.get("/api/sample-audio/{sample_id}")
async def get_sample_audio(sample_id: str):
    """Provides pre-synthesized conversational samples for one-click demo testing."""
    from pathlib import Path
    demo_dir = Path(__file__).resolve().parent.parent.parent.parent / "data" / "demo_samples"
    if sample_id in ("eval_te_01", "overlap") and (demo_dir / "overlap_two_speakers.wav").exists():
        with open(demo_dir / "overlap_two_speakers.wav", "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")
    if sample_id in ("eval_en_03", "clean") and (demo_dir / "clean_single_speaker.wav").exists():
        with open(demo_dir / "clean_single_speaker.wav", "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")
    if sample_id in ("eval_te_02", "cs") and (demo_dir / "overlap_two_speakers.wav").exists():
        with open(demo_dir / "overlap_two_speakers.wav", "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")

    dataset = SyntheticDatasetGenerator.get_dataset(split="test")
    match = next((s for s in dataset if s["id"] == sample_id), None)
    if not match:
        match = dataset[0]

    wav_bytes = AudioProcessor.audio_to_wav_bytes(match["mixture_audio"])
    return Response(content=wav_bytes, media_type="audio/wav")


DEMO_CATALOG = {
    "overlap_two_speakers": {
        "label": "Two overlapping speakers",
        "description": "Two voices speaking at the same time. No reference transcript is bundled.",
    },
    "clean_single_speaker": {
        "label": "Single speaker",
        "description": "One voice, no intentional overlap. No reference transcript is bundled.",
    },
}


@app.get("/api/demos")
async def list_demos():
    """Demo recordings that actually exist on this machine (not a fixed list)."""
    out = []
    for stem, meta in DEMO_CATALOG.items():
        f = DEMO_DIR / f"{stem}.wav"
        if f.exists():
            out.append({"id": stem, "filename": f.name, "size_bytes": f.stat().st_size, **meta})
    return out


@app.get("/api/demos/{demo_id}/audio")
async def get_demo_audio(demo_id: str):
    if demo_id not in DEMO_CATALOG or not (DEMO_DIR / f"{demo_id}.wav").exists():
        raise HTTPException(status_code=404, detail="Demo not found.")
    return FileResponse(DEMO_DIR / f"{demo_id}.wav", media_type="audio/wav")


@app.get("/api/sample-metadata")
async def get_sample_metadata():
    """Returns list of available built-in demonstration samples."""
    return SyntheticDatasetGenerator.CONVERSATIONAL_SEEDS
