"""Unit tests for evaluation metrics (SA-WER, standard WER, latency percentiles)."""

import pytest
from routone.schemas.models import TranscriptSegment
from routone.evaluation.metrics import EvaluationMetrics


def test_standard_wer():
    ref = "hello world how are you"
    hyp_exact = "hello world how are you"
    hyp_sub = "hello world who are you"
    hyp_del = "hello world"

    assert EvaluationMetrics.compute_standard_wer(ref, hyp_exact) == 0.0
    assert EvaluationMetrics.compute_standard_wer(ref, hyp_sub) == pytest.approx(0.2, abs=0.01)
    assert EvaluationMetrics.compute_standard_wer(ref, hyp_del) == pytest.approx(0.6, abs=0.01)


def test_speaker_attributed_wer():
    references = {
        "Speaker 1": "good morning everyone",
        "Speaker 2": "yes good morning"
    }

    hypotheses = [
        TranscriptSegment(id="1", start=0.0, end=1.5, speaker="Speaker 1", text="good morning everyone"),
        TranscriptSegment(id="2", start=1.0, end=2.5, speaker="Speaker 2", text="yes good morning")
    ]

    sa_wer, per_spk_wer, per_spk_recall = EvaluationMetrics.compute_speaker_attributed_wer(
        references, hypotheses
    )

    assert sa_wer == 0.0
    assert per_spk_recall["Speaker 1"] == 1.0
    assert per_spk_recall["Speaker 2"] == 1.0


def test_latency_percentiles():
    latencies = [100.0, 150.0, 200.0, 250.0, 300.0, 350.0, 400.0, 450.0, 500.0, 1000.0]
    p50, p90, p95 = EvaluationMetrics.compute_latency_percentiles(latencies)
    assert p50 == pytest.approx(325.0, abs=10.0)
    assert p95 > p90 >= p50
