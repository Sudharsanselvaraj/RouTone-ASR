"""Feature extraction for the benefit-aware separation routing controller."""

from __future__ import annotations
from typing import List, Dict
import numpy as np

from routone.schemas.models import OverlapRegion, TranscriptSegment


class FeatureExtractor:
    """Extracts interpretable acoustic, transcription, and computational features from candidate regions."""

    @classmethod
    def extract_region_features(
        cls,
        region: OverlapRegion,
        baseline_segments: List[TranscriptSegment],
        audio: np.ndarray,
        sr: int = 16000
    ) -> Dict[str, float]:
        """Extracts decision features for a candidate overlap region.

        Args:
            region: OverlapRegion detected by the acoustic detector.
            baseline_segments: Segments from the baseline mixture ASR pass.
            audio: Full 16kHz audio array.
            sr: Sample rate (16000).

        Returns:
            Dictionary of named scalar features.
        """
        # 1. Overlap duration and score
        duration = float(region.duration)
        overlap_score = float(region.overlap_score)
        pitch_clash = float(region.pitch_clash_index)

        # 2. Baseline ASR features in this region
        # Find baseline segments that intersect with [region.start, region.end]
        intersecting = [
            s for s in baseline_segments
            if max(s.start, region.start) < min(s.end, region.end)
        ]

        if intersecting:
            avg_logprob = float(np.mean([s.avg_logprob for s in intersecting]))
            word_count = sum(len(s.words) for s in intersecting)
            # Confidence proxy
            avg_conf = float(np.mean([s.confidence for s in intersecting]))
        else:
            # No baseline transcription in this region (potential dropped speech!)
            avg_logprob = -2.5
            word_count = 0
            avg_conf = 0.2

        # 3. Local energy dynamics
        start_samp = int(round(region.start * sr))
        end_samp = int(round(region.end * sr))
        slice_audio = audio[start_samp:end_samp]

        if len(slice_audio) > 100:
            rms_local = float(np.sqrt(np.mean(slice_audio**2)))
            peak_local = float(np.max(np.abs(slice_audio)))
            crest_factor = float(peak_local / (rms_local + 1e-6))
        else:
            rms_local = 0.0
            crest_factor = 1.0

        # 4. Normalized Additional Computational Cost Estimate
        # Separation cost scales linearly with duration: ~0.15s overhead per 1.0s audio on CPU
        # Plus 2x Whisper ASR passes on the separated streams
        estimated_latency_sec = 0.12 * duration + 0.25
        normalized_cost = float(np.clip(estimated_latency_sec / 3.0, 0.05, 1.0))

        return {
            "overlap_score": round(overlap_score, 4),
            "overlap_duration": round(duration, 3),
            "pitch_clash_index": round(pitch_clash, 4),
            "baseline_avg_logprob": round(avg_logprob, 4),
            "baseline_confidence": round(avg_conf, 4),
            "baseline_word_count": float(word_count),
            "crest_factor": round(crest_factor, 3),
            "estimated_latency_sec": round(estimated_latency_sec, 3),
            "normalized_cost": round(normalized_cost, 4),
            "speaker_count_estimate": float(region.speaker_count_estimate),
        }
