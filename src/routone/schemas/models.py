"""Pydantic data models defining the contracts across the Routone pipeline."""

from __future__ import annotations
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class RoutingMode(str, Enum):
    ROUTE_SEPARATION = "ROUTE_SEPARATION"
    KEEP_MIXTURE = "KEEP_MIXTURE"
    FLAG_REVIEW = "FLAG_REVIEW"


class AudioMetadata(BaseModel):
    duration_seconds: float = Field(..., description="Duration of audio in seconds")
    sample_rate: int = Field(default=16000, description="Canonical sample rate (Hz)")
    channels: int = Field(default=1, description="Number of audio channels")
    rms_energy: float = Field(..., description="Root Mean Square energy of the signal")
    peak_amplitude: float = Field(..., description="Peak absolute amplitude")
    estimated_snr_db: float = Field(..., description="Estimated Signal-to-Noise Ratio (dB)")
    codec: Optional[str] = Field(default=None, description="Original audio container/codec")


class TranscriptWord(BaseModel):
    word: str
    start: float
    end: float
    probability: float = Field(default=1.0, description="Confidence/probability of word token")
    speaker: Optional[str] = Field(default=None, description="Attributed speaker label")


class TranscriptSegment(BaseModel):
    id: str
    start: float
    end: float
    speaker: str = Field(default="Speaker 1")
    text: str
    language: str = Field(default="en")
    avg_logprob: float = Field(default=0.0)
    no_speech_prob: float = Field(default=0.0)
    words: List[TranscriptWord] = Field(default_factory=list)
    source_path: str = Field(
        default="mixture",
        description="'mixture', 'separated_stream_a', or 'separated_stream_b'"
    )
    confidence: float = Field(default=1.0)


class OverlapRegion(BaseModel):
    region_id: str
    start: float
    end: float
    duration: float
    overlap_score: float = Field(
        ...,
        description="Confidence score [0.0, 1.0] indicating probability of overlapping talkers"
    )
    speaker_count_estimate: int = Field(default=2)
    snr_estimate_db: float = Field(default=12.0)
    energy_variance: float = Field(default=0.0)
    pitch_clash_index: float = Field(default=0.0)


class RoutingDecision(BaseModel):
    region_id: str
    start: float
    end: float
    decision: RoutingMode
    predicted_benefit: float = Field(..., description="Predicted reduction in WER / accuracy gain")
    normalized_cost: float = Field(..., description="Normalized computational latency cost")
    utility: float = Field(..., description="Benefit - lambda * Cost")
    features: Dict[str, float] = Field(default_factory=dict)
    rationale: str = Field(default="")
    lambda_param: float = Field(default=0.5)


class SeparationResult(BaseModel):
    region_id: str
    stream_a_audio_b64: Optional[str] = None
    stream_b_audio_b64: Optional[str] = None
    separation_duration_ms: float = 0.0
    rms_ratio_db: float = 0.0
    success: bool = True
    fallback_used: bool = False
    details: str = "ConvTasNet Libri2Mix separation executed successfully"
    window_start: Optional[float] = Field(default=None, description="Start (s) of the audio window that was separated")
    window_end: Optional[float] = Field(default=None, description="End (s) of the audio window that was separated")


class TraceEvent(BaseModel):
    """A real, timestamped event emitted by the pipeline while processing a recording."""
    event: str
    t_ms: float = Field(..., description="Milliseconds since pipeline start (monotonic clock)")
    duration_ms: Optional[float] = Field(default=None, description="Measured duration of the step, if it is a timed step")
    region_id: Optional[str] = None
    detail: str = ""


class ReconciliationResult(BaseModel):
    baseline_segments: List[TranscriptSegment]
    separated_segments: List[TranscriptSegment]
    final_segments: List[TranscriptSegment]
    conflicts_resolved: int = 0
    words_added_from_separation: int = 0
    words_rejected_as_hallucinations: int = 0


class PipelineResult(BaseModel):
    audio_metadata: AudioMetadata
    baseline_segments: List[TranscriptSegment]
    detected_overlaps: List[OverlapRegion]
    routing_decisions: List[RoutingDecision]
    reconciliation: ReconciliationResult
    final_transcript: List[TranscriptSegment]
    metrics: Dict[str, Any] = Field(default_factory=dict)
    processing_time_ms: float = 0.0
    separation_results: List[SeparationResult] = Field(default_factory=list)
    trace: List[TraceEvent] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict, description="Settings actually used for this run")
    run_id: Optional[str] = Field(default=None, description="Identifier of the persisted run, if saved")


class EvaluationMetricSummary(BaseModel):
    method_name: str
    speaker_attributed_wer: float
    standard_wer: float
    overlap_wer: float
    speaker_recalls: Dict[str, float] = Field(default_factory=dict)
    p50_latency_ms: float
    p90_latency_ms: float
    p95_latency_ms: float
    separation_invocation_rate: Optional[float] = Field(
        default=None,
        description="Separated regions / detected regions. None when no regions were detected (undefined, not zero).",
    )
    total_regions_processed: int
    evaluated_samples_count: int
    # --- integrity bookkeeping (added; older reports lack these) ---
    reference_word_count: int = 0
    hypothesis_word_count: int = 0
    empty_hypothesis_samples: int = 0
    separated_regions: int = 0
    latency_ms_samples: List[float] = Field(default_factory=list)
    valid: bool = True
    notes: List[str] = Field(default_factory=list)


class BenchmarkReport(BaseModel):
    timestamp: str
    dataset_name: str
    results: List[EvaluationMetricSummary]
    pareto_optimal_system: str
    summary_analysis: str
    # --- integrity bookkeeping (added; older reports lack these) ---
    status: str = Field(default="unknown", description="'valid', 'invalid' or 'incomplete'")
    warnings: List[str] = Field(default_factory=list)
    pareto_front: List[str] = Field(default_factory=list)
    dataset: Dict[str, Any] = Field(default_factory=dict)
    not_evaluated: Dict[str, str] = Field(default_factory=dict, description="Strategy -> reason it was not run")
    config: Dict[str, Any] = Field(default_factory=dict)
