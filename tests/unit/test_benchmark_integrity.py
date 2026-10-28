"""Tests for benchmark metric integrity: undefined values, Pareto logic, report validity."""

import numpy as np
import pytest

from overlapweave.schemas.models import TranscriptSegment
from overlapweave.evaluation.metrics import EvaluationMetrics
from overlapweave.evaluation.harness import BenchmarkHarness


def test_wer_empty_reference_is_undefined_not_zero():
    with pytest.raises(ValueError):
        EvaluationMetrics.compute_standard_wer("", "")
    with pytest.raises(ValueError):
        EvaluationMetrics.compute_standard_wer("", "something")


def test_wer_empty_hypothesis_is_all_deletions():
    assert EvaluationMetrics.compute_standard_wer("a b c", "") == 1.0


def test_sa_wer_skips_speaker_without_reference():
    hyp = [TranscriptSegment(id="1", start=0, end=1, speaker="Speaker 1", text="hello there")]
    sa, per_wer, per_recall = EvaluationMetrics.compute_speaker_attributed_wer(
        {"Speaker 1": "hello there", "Speaker 2": ""}, hyp
    )
    assert sa == 0.0
    assert "Speaker 2" not in per_wer and "Speaker 2" not in per_recall


def test_sa_wer_no_references_raises():
    with pytest.raises(ValueError):
        EvaluationMetrics.compute_speaker_attributed_wer({"Speaker 1": "", "Speaker 2": ""}, [])


def test_pareto_front():
    pts = {"a": (0.5, 100.0), "b": (0.3, 500.0), "c": (0.6, 600.0), "d": (0.3, 500.0)}
    front = EvaluationMetrics.pareto_front(pts)
    assert "c" not in front            # dominated by a and b
    assert set(front) == {"a", "b", "d"}  # equal points do not dominate each other


def test_tone_dataset_is_reported_invalid():
    """Harmonic-tone mixtures contain no speech; the report must say so instead of scoring them."""
    from overlapweave.evaluation.synthetic_generator import SyntheticDatasetGenerator
    samples = SyntheticDatasetGenerator.get_dataset("test")[:1]
    report = BenchmarkHarness(output_dir="/tmp/routone_test_bench").run_benchmark(
        samples=samples, save_results=False, dataset_name="tone test"
    )
    assert report.status == "invalid"
    assert report.dataset["contains_speech"] is False
    assert report.pareto_front == []
    assert report.pareto_optimal_system == "Not determined"
    assert "invalid" in report.summary_analysis.lower()
    assert "Oracle (Diagnostic Bound)" in report.not_evaluated
    assert all(m.method_name != "Oracle (Diagnostic Bound)" for m in report.results)


def test_separation_rate_undefined_without_regions():
    from overlapweave.evaluation.synthetic_generator import SyntheticDatasetGenerator
    samples = SyntheticDatasetGenerator.get_dataset("test")[:1]
    report = BenchmarkHarness(output_dir="/tmp/routone_test_bench").run_benchmark(
        samples=samples, save_results=False
    )
    for m in report.results:
        if m.total_regions_processed == 0:
            assert m.separation_invocation_rate is None
