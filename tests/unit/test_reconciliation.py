"""Unit tests for CandidateReconciler."""

import pytest
from routone.schemas.models import (
    TranscriptSegment,
    RoutingDecision,
    RoutingMode,
)
from routone.reconciliation.reconciler import CandidateReconciler


def test_reconciliation_merge_and_sort():
    baseline = [
        TranscriptSegment(
            id="base_1",
            start=0.0,
            end=1.5,
            speaker="Speaker 1",
            text="Hello welcome to the meeting",
            source_path="mixture"
        ),
        TranscriptSegment(
            id="base_2",
            start=1.5,
            end=3.5,
            speaker="Speaker 1",
            text="mixed confused speech",
            source_path="mixture"
        ),
        TranscriptSegment(
            id="base_3",
            start=3.5,
            end=5.0,
            speaker="Speaker 1",
            text="now we conclude the call",
            source_path="mixture"
        ),
    ]

    # Separation routed for [1.5, 3.5]
    routing = [
        RoutingDecision(
            region_id="ov_1",
            start=1.5,
            end=3.5,
            decision=RoutingMode.ROUTE_SEPARATION,
            predicted_benefit=0.8,
            normalized_cost=0.2,
            utility=0.7
        )
    ]

    separated = [
        TranscriptSegment(
            id="sep_a",
            start=1.6,
            end=3.4,
            speaker="Speaker 1",
            text="I will present the progress now",
            source_path="separated_stream_a"
        ),
        TranscriptSegment(
            id="sep_b",
            start=1.8,
            end=3.2,
            speaker="Speaker 2",
            text="Sure go ahead",
            source_path="separated_stream_b"
        ),
    ]

    res = CandidateReconciler.reconcile(baseline, separated, routing)

    # Base 1 and Base 3 should be kept, Base 2 should be replaced by sep_a and sep_b
    assert len(res.final_segments) == 4
    texts = [s.text for s in res.final_segments]
    assert "Hello welcome to the meeting" in texts
    assert "I will present the progress now" in texts
    assert "Sure go ahead" in texts
    assert "now we conclude the call" in texts
    assert "mixed confused speech" not in texts

    # Verify chronological ordering
    for i in range(len(res.final_segments) - 1):
        assert res.final_segments[i].start <= res.final_segments[i + 1].start


def test_reconciliation_hallucination_filtering():
    assert CandidateReconciler.is_hallucination("thank you thank you thank you thank you") is True
    assert CandidateReconciler.is_hallucination("வணக்கம் வணக்கம் வணக்கம் வணக்கம்") is True
    assert CandidateReconciler.is_hallucination("This is a normal conversational response.") is False
