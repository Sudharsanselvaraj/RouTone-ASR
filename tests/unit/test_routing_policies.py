"""Tests for policy replay: replayed decisions must equal the controllers' own decisions."""

import numpy as np
import pytest

from overlapweave.schemas.models import OverlapRegion, TranscriptSegment, RoutingMode
from overlapweave.routing.policies import build_controller, replay_decisions, STRATEGIES
from overlapweave.routing.controller import BenefitAwareController


def _region(rid="r0", score=0.75, clash=0.65, dur=2.0, spk=2):
    return OverlapRegion(region_id=rid, start=1.0, end=1.0 + dur, duration=dur, overlap_score=score,
                         speaker_count_estimate=spk, pitch_clash_index=clash)


def _baseline(logprob=-0.95):
    return [TranscriptSegment(id="b", start=0.0, end=5.0, text="x y z", avg_logprob=logprob, confidence=0.4)]


@pytest.mark.parametrize("lam", [0.1, 0.45, 1.5])
def test_replay_matches_controller_for_benefit_aware(lam):
    audio = np.random.normal(0, 0.1, 16000 * 5).astype(np.float32)
    ctrl = BenefitAwareController(lambda_param=lam)
    for region in (_region("a"), _region("b", score=0.3, clash=0.2), _region("c", spk=3)):
        original = ctrl.route_region(region, _baseline(), audio)
        replayed = replay_decisions([original], "benefit_aware", lambda_param=lam)[0]
        assert replayed.decision == original.decision
        assert replayed.utility == original.utility


def test_lambda_changes_replayed_decision():
    audio = np.random.normal(0, 0.1, 16000 * 5).astype(np.float32)
    base = BenefitAwareController(lambda_param=0.1).route_region(_region(), _baseline(), audio)
    low = replay_decisions([base], "benefit_aware", lambda_param=0.0)[0]
    # utility is benefit - lambda*cost, so a larger penalty can never raise it
    high = replay_decisions([base], "benefit_aware", lambda_param=5.0)[0]
    assert low.utility >= high.utility


def test_fixed_policies():
    audio = np.random.normal(0, 0.1, 16000 * 5).astype(np.float32)
    d = BenefitAwareController().route_region(_region(), _baseline(), audio)
    assert replay_decisions([d], "never_separate")[0].decision == RoutingMode.KEEP_MIXTURE
    assert replay_decisions([d], "always_separate")[0].decision == RoutingMode.ROUTE_SEPARATION
    assert replay_decisions([d], "threshold", threshold=0.99)[0].decision == RoutingMode.KEEP_MIXTURE


def test_unknown_strategy():
    with pytest.raises(ValueError):
        build_controller("bogus")
    assert "benefit_aware" in STRATEGIES


def test_replay_requires_stored_features():
    from overlapweave.schemas.models import RoutingDecision
    d = RoutingDecision(region_id="r", start=0, end=1, decision=RoutingMode.KEEP_MIXTURE,
                        predicted_benefit=0.0, normalized_cost=0.0, utility=0.0,
                        features={"overlap_score": 0.5, "normalized_cost": 0.0})
    with pytest.raises(ValueError, match="does not store"):
        replay_decisions([d], "benefit_aware")
    assert replay_decisions([d], "threshold", threshold=0.4)[0].decision == RoutingMode.ROUTE_SEPARATION
