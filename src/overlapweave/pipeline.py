"""Unified end-to-end processing pipeline for OverlapWeave."""

from __future__ import annotations
import time
from typing import Optional, Union, List
import numpy as np

from overlapweave.audio.processor import AudioProcessor
from overlapweave.asr.whisper_engine import WhisperASREngine
from overlapweave.overlap.detector import OverlapDetector
from overlapweave.separation.separator import ConvTasNetSeparator
from overlapweave.routing.controller import (
    BaseController,
    BenefitAwareController,
    ThresholdController,
)
from overlapweave.reconciliation.reconciler import CandidateReconciler
from overlapweave.schemas.models import (
    PipelineResult,
    TranscriptSegment,
    OverlapRegion,
    RoutingDecision,
    RoutingMode,
    SeparationResult,
)


class OverlapWeavePipeline:
    """Orchestrates audio preprocessing, baseline ASR, overlap detection,

    benefit-aware routing, selective speech separation, and transcript reconciliation.
    """

    def __init__(
        self,
        asr_engine: Optional[WhisperASREngine] = None,
        overlap_detector: Optional[OverlapDetector] = None,
        separator: Optional[ConvTasNetSeparator] = None,
        controller: Optional[BaseController] = None,
        language: Optional[str] = None
    ):
        self.asr_engine = asr_engine or WhisperASREngine.get_default_engine()
        self.overlap_detector = overlap_detector or OverlapDetector()
        self.separator = separator or ConvTasNetSeparator.get_default_separator()
        self.controller = controller or BenefitAwareController()
        self.language = language

    def process_audio(
        self,
        audio_source: Union[str, bytes, np.ndarray],
        include_separated_audio: bool = False,
        controller_override: Optional[BaseController] = None
    ) -> PipelineResult:
        """Executes the full OverlapWeave pipeline on an audio input.

        Args:
            audio_source: Filepath, bytes buffer, or 16kHz float32 numpy array.
            include_separated_audio: If True, includes base64 WAV streams for visual inspection.
            controller_override: Optional custom controller (e.g. for comparative benchmarking).

        Returns:
            PipelineResult containing complete auditable trajectory and final transcript.
        """
        pipeline_start = time.perf_counter()

        # Step 1: Audio ingestion & validation
        if isinstance(audio_source, np.ndarray):
            audio = audio_source
            duration = len(audio) / 16000.0
            from overlapweave.schemas.models import AudioMetadata
            metadata = AudioMetadata(
                duration_seconds=round(duration, 3),
                sample_rate=16000,
                channels=1,
                rms_energy=round(float(np.sqrt(np.mean(audio**2))), 5),
                peak_amplitude=round(float(np.max(np.abs(audio))), 5),
                estimated_snr_db=round(AudioProcessor.estimate_snr_db(audio), 2),
                codec="PCM_16K_RAW"
            )
        else:
            audio, metadata = AudioProcessor.load_audio(audio_source)

        # Step 2: Baseline ASR on raw mixture
        baseline_segments, baseline_ms, detected_lang = self.asr_engine.transcribe(
            audio,
            language=self.language,
            speaker_label="Speaker 1",
            source_path="mixture"
        )

        # Step 3: Overlap Detection
        detected_overlaps = self.overlap_detector.detect_overlaps(audio, sr=16000)

        # Step 4: Routing decisions via controller
        controller = controller_override or self.controller
        routing_decisions: List[RoutingDecision] = []
        separated_segments: List[TranscriptSegment] = []
        sep_results: List[SeparationResult] = []

        for region in detected_overlaps:
            decision = controller.route_region(
                region=region,
                baseline_segments=baseline_segments,
                audio=audio,
                sr=16000
            )
            routing_decisions.append(decision)

            # Step 5: Selective separation if routed
            if decision.decision == RoutingMode.ROUTE_SEPARATION:
                # Extract audio region with protective boundary padding
                region_audio, padded_start, padded_end = AudioProcessor.extract_region(
                    audio, region.start, region.end, sr=16000, pad_sec=0.1
                )

                stream_a, stream_b, sep_res = self.separator.separate_region(
                    region_audio,
                    region_id=region.region_id,
                    include_b64_audio=include_separated_audio
                )
                sep_results.append(sep_res)

                if sep_res.success:
                    # Transcribe separated stream A (Speaker 1)
                    segs_a, _, _ = self.asr_engine.transcribe(
                        stream_a,
                        language=self.language,
                        speaker_label="Speaker 1",
                        source_path="separated_stream_a",
                        time_offset=padded_start
                    )
                    # Transcribe separated stream B (Speaker 2)
                    segs_b, _, _ = self.asr_engine.transcribe(
                        stream_b,
                        language=self.language,
                        speaker_label="Speaker 2",
                        source_path="separated_stream_b",
                        time_offset=padded_start
                    )

                    separated_segments.extend(segs_a)
                    separated_segments.extend(segs_b)

        # Step 6: Candidate reconciliation
        reconciliation = CandidateReconciler.reconcile(
            baseline_segments=baseline_segments,
            separated_segments=separated_segments,
            routing_decisions=routing_decisions
        )

        total_elapsed_ms = (time.perf_counter() - pipeline_start) * 1000.0

        # Step 7: Telemetry & metrics
        metrics = {
            "total_audio_duration_s": metadata.duration_seconds,
            "baseline_transcribe_time_ms": round(baseline_ms, 2),
            "total_processing_time_ms": round(total_elapsed_ms, 2),
            "real_time_factor": round((total_elapsed_ms / 1000.0) / max(0.1, metadata.duration_seconds), 3),
            "overlap_regions_count": len(detected_overlaps),
            "separated_regions_count": sum(1 for d in routing_decisions if d.decision == RoutingMode.ROUTE_SEPARATION),
            "separation_invocation_rate": round(
                sum(1 for d in routing_decisions if d.decision == RoutingMode.ROUTE_SEPARATION) / max(1, len(detected_overlaps)),
                3
            ),
            "detected_language": detected_lang
        }

        return PipelineResult(
            audio_metadata=metadata,
            baseline_segments=baseline_segments,
            detected_overlaps=detected_overlaps,
            routing_decisions=routing_decisions,
            reconciliation=reconciliation,
            final_transcript=reconciliation.final_segments,
            metrics=metrics,
            processing_time_ms=round(total_elapsed_ms, 2)
        )
