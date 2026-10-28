"""Routing policy registry: build controllers by name and replay decisions from stored features.

Replay re-runs only the *decision rule* of each policy over the acoustic/ASR features that were
extracted during a real pipeline run. It does not re-run ASR or separation.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional

from overlapweave.schemas.models import RoutingDecision, RoutingMode
from overlapweave.routing.controller import (
    BaseController,
    BenefitAwareController,
    ThresholdController,
)

STRATEGIES = ("benefit_aware", "threshold", "always_separate", "never_separate")


class NeverSeparateController(BaseController):
    """Baseline A: Never separates; keeps mixture baseline transcription."""

    def decide(self, region_id: str, start: float, end: float, features: Dict[str, float]) -> RoutingDecision:
        return RoutingDecision(
            region_id=region_id,
            start=start,
            end=end,
            decision=RoutingMode.KEEP_MIXTURE,
            predicted_benefit=0.0,
            normalized_cost=0.0,
            utility=0.0,
            features=features,
            rationale="Baseline A policy: Never separate; use mixture ASR directly.",
            lambda_param=0.5,
        )

    def route_region(self, region, baseline_segments, audio, sr=16000):
        return self.decide(
            region.region_id, region.start, region.end,
            {"overlap_score": region.overlap_score, "normalized_cost": 0.0},
        )


class AlwaysSeparateController(BaseController):
    """Baseline B: Always routes all detected overlap regions to speech separation.

    ``predicted_benefit`` / ``utility`` are fixed policy constants, not estimates.
    """

    NORM_COST = 0.35

    def decide(self, region_id: str, start: float, end: float, features: Dict[str, float]) -> RoutingDecision:
        return RoutingDecision(
            region_id=region_id,
            start=start,
            end=end,
            decision=RoutingMode.ROUTE_SEPARATION,
            predicted_benefit=0.85,
            normalized_cost=self.NORM_COST,
            utility=0.50,
            features=features,
            rationale="Baseline B policy: Always separate every candidate overlap region.",
            lambda_param=0.5,
        )

    def route_region(self, region, baseline_segments, audio, sr=16000):
        return self.decide(
            region.region_id, region.start, region.end,
            {"overlap_score": region.overlap_score, "normalized_cost": self.NORM_COST},
        )


def build_controller(
    strategy: str,
    lambda_param: float = 0.45,
    threshold: float = 0.50,
) -> BaseController:
    if strategy == "benefit_aware":
        return BenefitAwareController(lambda_param=lambda_param)
    if strategy == "threshold":
        return ThresholdController(threshold=threshold)
    if strategy == "always_separate":
        return AlwaysSeparateController()
    if strategy == "never_separate":
        return NeverSeparateController()
    raise ValueError(f"Unknown routing strategy '{strategy}'. Expected one of {STRATEGIES}.")


BENEFIT_AWARE_FEATURES = (
    "overlap_score", "pitch_clash_index", "baseline_avg_logprob",
    "overlap_duration", "normalized_cost", "speaker_count_estimate",
)
THRESHOLD_FEATURES = ("overlap_score", "normalized_cost")


def replay_decisions(
    stored: List[RoutingDecision],
    strategy: str,
    lambda_param: float = 0.45,
    threshold: float = 0.50,
) -> List[RoutingDecision]:
    """Re-evaluates a policy's decision rule on features stored with each routing decision."""
    controller = build_controller(strategy, lambda_param=lambda_param, threshold=threshold)
    out: List[RoutingDecision] = []
    for d in stored:
        if not hasattr(controller, "decide"):
            raise ValueError(f"Strategy '{strategy}' does not support feature replay.")
        needed = {"benefit_aware": BENEFIT_AWARE_FEATURES, "threshold": THRESHOLD_FEATURES}.get(strategy, ())
        missing = [k for k in needed if k not in d.features]
        if missing:
            raise ValueError(
                f"Region {d.region_id} was routed by a policy that does not store the evidence features "
                f"({', '.join(missing)} missing); '{strategy}' cannot be replayed on it."
            )
        out.append(controller.decide(d.region_id, d.start, d.end, dict(d.features)))
    return out


def benefit_aware_spec(lambda_param: Optional[float] = None) -> Dict[str, Any]:
    """Machine-readable description of the implemented benefit-aware rule (for display)."""
    return {
        "strategy": "benefit_aware",
        "calibrated": False,
        "benefit": (
            "predicted_benefit = 0.05 if (pitch_clash_index < 0.30 and baseline_avg_logprob > -0.45) "
            "else sigmoid(-1.2 + 2.5*overlap_score + 2.5*pitch_clash_index + 0.8*uncertainty + 0.4*overlap_duration), "
            "uncertainty = clip(-baseline_avg_logprob - 0.40, 0, 3)"
        ),
        "cost": "normalized_cost = clip((0.12*duration_s + 0.25) / 3.0, 0.05, 1.0)  (estimate, not measured)",
        "utility": "utility = predicted_benefit - lambda * normalized_cost",
        "rule": (
            "speaker_count >= 3 -> FLAG_REVIEW; utility > 0.05 -> ROUTE_SEPARATION; utility < -0.15 -> KEEP_MIXTURE; "
            "otherwise ROUTE_SEPARATION only if baseline_avg_logprob <= -0.65"
        ),
        "lambda": lambda_param,
    }
