"""Unit tests for OverlapDetector."""

import numpy as np
import pytest
from overlapweave.overlap.detector import OverlapDetector


def test_overlap_detector_silence():
    detector = OverlapDetector()
    silence = np.zeros(16000 * 2, dtype=np.float32)
    regions = detector.detect_overlaps(silence, sr=16000)
    assert len(regions) == 0


def test_overlap_detector_single_clean_tone():
    detector = OverlapDetector(overlap_threshold=0.55)
    sr = 16000
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    # Pure single harmonic tone (single speaker clean)
    pure_tone = 0.5 * np.sin(2 * np.pi * 150 * t)
    regions = detector.detect_overlaps(pure_tone.astype(np.float32), sr=sr)
    # Single clean harmonic tone should not trigger multi-pitch overlap
    assert len(regions) == 0


def test_overlap_detector_clashing_dual_tones():
    detector = OverlapDetector(overlap_threshold=0.30, min_overlap_duration_s=0.2)
    sr = 16000
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    # Two competing asynchronous fundamental frequencies + noise modulation
    dual_tones = (
        0.4 * np.sin(2 * np.pi * 130 * t) +
        0.4 * np.sin(2 * np.pi * 215 * t) +
        0.1 * np.random.normal(0, 0.05, len(t))
    ).astype(np.float32)

    frame_times, scores, features = detector.compute_frame_features(dual_tones, sr=sr)
    assert len(scores) > 0
    assert np.max(scores) > 0.25
    assert "clash_scores" in features
