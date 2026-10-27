"""Unit tests for routing controllers and feature extraction."""

import numpy as np
import pytest
from overlapweave.schemas.models import OverlapRegion, TranscriptSegment, RoutingMode
from overlapweave.routing.controller import (
    ThresholdController,
    BenefitAwareController,
    OracleController,
)


@pytest.fixture
def dummy_region():
    return OverlapRegion(
        region_id="reg_test",
        start=1.0,
        end=3.0,
        duration=2.0,
        overlap_score=0.75,
        speaker_count_estimate=2,
        snr_estimate_db=15.0,
        energy_variance=0.04,
        pitch_clash_index=0.65
    )


@pytest.fixture
def dummy_baseline():
    return [
        TranscriptSegment(
            id="base_1",
            start=0.5,
            end=3.5,
            speaker="Speaker 1",
            text="hello this is a baseline test",
            language="en",
            avg_logprob=-0.95,
            confidence=0.38
        )
    ]


def test_threshold_controller(dummy_region, dummy_baseline):
    audio = np.random.normal(0, 0.1, 16000 * 4).astype(np.float32)

    ctrl_high = ThresholdController(threshold=0.80)
    dec_high = ctrl_high.route_region(dummy_region, dummy_baseline, audio)
    assert dec_high.decision == RoutingMode.KEEP_MIXTURE

    ctrl_low = ThresholdController(threshold=0.60)
    dec_low = ctrl_low.route_region(dummy_region, dummy_baseline, audio)
    assert dec_low.decision == RoutingMode.ROUTE_SEPARATION


def test_benefit_aware_controller(dummy_region, dummy_baseline):
    audio = np.random.normal(0, 0.1, 16000 * 4).astype(np.float32)

    controller = BenefitAwareController(lambda_param=0.4)
    decision = controller.route_region(dummy_region, dummy_baseline, audio)

    assert decision.decision in [RoutingMode.ROUTE_SEPARATION, RoutingMode.KEEP_MIXTURE]
    assert 0.0 <= decision.predicted_benefit <= 1.0
    assert decision.normalized_cost > 0.0
    assert "overlap_score" in decision.features
    assert "normalized_cost" in decision.features


def test_benefit_aware_controller_multi_speaker_flag(dummy_baseline):
    audio = np.random.normal(0, 0.1, 16000 * 4).astype(np.float32)
    # 3 speakers exceeds 2-speaker model capacity
    region_3spk = OverlapRegion(
        region_id="reg_3",
        start=1.0,
        end=3.0,
        duration=2.0,
        overlap_score=0.85,
        speaker_count_estimate=3,
        snr_estimate_db=10.0
    )

    controller = BenefitAwareController()
    decision = controller.route_region(region_3spk, dummy_baseline, audio)
    assert decision.decision == RoutingMode.FLAG_REVIEW


def test_oracle_controller(dummy_region, dummy_baseline):
    audio = np.random.normal(0, 0.1, 16000 * 4).astype(np.float32)

    # When separation improves WER by 20%
    oracle_improve = OracleController(ground_truth_wer_diffs={"reg_test": 0.20})
    dec1 = oracle_improve.route_region(dummy_region, dummy_baseline, audio)
    assert dec1.decision == RoutingMode.ROUTE_SEPARATION

    # When separation degrades WER
    oracle_degrade = OracleController(ground_truth_wer_diffs={"reg_test": -0.10})
    dec2 = oracle_degrade.route_region(dummy_region, dummy_baseline, audio)
    assert dec2.decision == RoutingMode.KEEP_MIXTURE
