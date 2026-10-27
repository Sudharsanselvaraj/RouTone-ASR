"""End-to-end integration test of the full OverlapWeave pipeline."""

import numpy as np
import pytest
from overlapweave.pipeline import OverlapWeavePipeline
from overlapweave.schemas.models import PipelineResult, RoutingMode


def test_pipeline_e2e_synthetic_sample():
    pipeline = OverlapWeavePipeline()

    # Generate a realistic 2.5 second synthetic audio signal with dual pitch
    sr = 16000
    duration = 2.5
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Speaker 1: 140 Hz, Speaker 2 enters at 1.0s: 220 Hz
    s1 = 0.4 * np.sin(2 * np.pi * 140 * t)
    s2 = np.zeros_like(t)
    s2_mask = t >= 1.0
    s2[s2_mask] = 0.4 * np.sin(2 * np.pi * 220 * t[s2_mask])

    mix = (s1 + s2).astype(np.float32)

    result = pipeline.process_audio(mix, include_separated_audio=True)

    assert isinstance(result, PipelineResult)
    assert result.audio_metadata.duration_seconds == pytest.approx(2.5, abs=0.1)
    assert result.audio_metadata.sample_rate == 16000
    assert result.processing_time_ms > 0
    assert "real_time_factor" in result.metrics
    assert isinstance(result.final_transcript, list)
