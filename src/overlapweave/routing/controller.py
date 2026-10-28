"""Adaptive routing controllers balancing recognition benefit against separation latency."""

from __future__ import annotations
import abc
import math
from typing import Dict, Any, Optional
import numpy as np

from overlapweave.schemas.models import (
    RoutingDecision,
    RoutingMode,
    OverlapRegion,
    TranscriptSegment,
)
from overlapweave.routing.features import FeatureExtractor


class BaseController(abc.ABC):
    """Abstract interface for region routing controllers."""

    @abc.abstractmethod
    def route_region(
        self,
        region: OverlapRegion,
        baseline_segments: list[TranscriptSegment],
        audio: np.ndarray,
        sr: int = 16000
    ) -> RoutingDecision:
        """Determines routing action for candidate overlap region."""
        pass


class ThresholdController(BaseController):
    """Baseline C: Routes to separation if acoustic overlap score exceeds fixed threshold theta."""

    def __init__(self, threshold: float = 0.50):
        self.threshold = threshold

    def route_region(
        self,
        region: OverlapRegion,
        baseline_segments: list[TranscriptSegment],
        audio: np.ndarray,
        sr: int = 16000
    ) -> RoutingDecision:
        features = FeatureExtractor.extract_region_features(region, baseline_segments, audio, sr)
        return self.decide(region.region_id, region.start, region.end, features)

    def decide(self, region_id: str, start: float, end: float, features: Dict[str, float]) -> RoutingDecision:
        """Pure decision rule over already-extracted features (used by route_region and policy replay)."""
        score = features["overlap_score"]
        norm_cost = features["normalized_cost"]

        if score >= self.threshold:
            decision = RoutingMode.ROUTE_SEPARATION
            predicted_benefit = score
            utility = score - 0.5 * norm_cost
            rationale = f"Overlap score {score:.2f} >= threshold {self.threshold:.2f} (Baseline C rule)."
        else:
            decision = RoutingMode.KEEP_MIXTURE
            predicted_benefit = 0.0
            utility = 0.0
            rationale = f"Overlap score {score:.2f} < threshold {self.threshold:.2f}; keeping mixture."

        return RoutingDecision(
            region_id=region_id,
            start=start,
            end=end,
            decision=decision,
            predicted_benefit=round(predicted_benefit, 4),
            normalized_cost=round(norm_cost, 4),
            utility=round(utility, 4),
            features=features,
            rationale=rationale,
            lambda_param=0.5
        )


class BenefitAwareController(BaseController):
    """Proposed Method: Utility-maximizer predicting recognition improvement against latency cost.

    Utility formulation:
        utility = expected_accuracy_gain - lambda_param * normalized_cost
    """

    def __init__(
        self,
        lambda_param: float = 0.45,
        review_threshold: float = 0.88,
        weights: Optional[Dict[str, float]] = None,
        bias: float = -0.30
    ):
        self.lambda_param = lambda_param
        self.review_threshold = review_threshold
        # Calibrated weights based on acoustic overlap intensity, baseline uncertainty, and duration
        self.weights = weights or {
            "overlap_score": 1.65,
            "pitch_clash_index": 0.85,
            "baseline_avg_logprob": -0.75,  # lower logprob -> higher expected benefit from separation
            "overlap_duration": 0.40,
            "crest_factor": -0.10
        }
        self.bias = bias

    def predict_benefit(self, features: Dict[str, float]) -> float:
        """Estimates expected accuracy gain (reduction in Word Error Rate) in [0.0, 1.0]."""
        clash = features.get("pitch_clash_index", 0.0)
        duration = features.get("overlap_duration", 0.0)
        score = features.get("overlap_score", 0.0)
        logprob = features.get("baseline_avg_logprob", 0.0)

        # If clean speaker indicators (low pitch clash and high baseline confidence)
        if clash < 0.30 and logprob > -0.45:
            return 0.05

        uncertainty = float(np.clip(-logprob - 0.40, 0.0, 3.0))
        logit = -1.2 + (2.5 * score) + (2.5 * clash) + (0.8 * uncertainty) + (0.4 * duration)
        benefit = 1.0 / (1.0 + math.exp(-float(np.clip(logit, -10.0, 10.0))))
        return float(benefit)

    def route_region(
        self,
        region: OverlapRegion,
        baseline_segments: list[TranscriptSegment],
        audio: np.ndarray,
        sr: int = 16000
    ) -> RoutingDecision:
        features = FeatureExtractor.extract_region_features(region, baseline_segments, audio, sr)
        return self.decide(region.region_id, region.start, region.end, features)

    def decide(self, region_id: str, start: float, end: float, features: Dict[str, float]) -> RoutingDecision:
        """Pure decision rule over already-extracted features (used by route_region and policy replay)."""
        norm_cost = features["normalized_cost"]
        speaker_count = features["speaker_count_estimate"]

        # Check for multi-speaker ambiguity: ConvTasNet is 2-speaker
        if speaker_count >= 3.0:
            return RoutingDecision(
                region_id=region_id,
                start=start,
                end=end,
                decision=RoutingMode.FLAG_REVIEW,
                predicted_benefit=0.10,
                normalized_cost=round(norm_cost, 4),
                utility=-0.20,
                features=features,
                rationale="Estimated speaker count >= 3 exceeds 2-stream separation model capacity. Flagged for review.",
                lambda_param=self.lambda_param
            )

        predicted_benefit = self.predict_benefit(features)
        utility = predicted_benefit - (self.lambda_param * norm_cost)

        if utility > 0.05:
            decision = RoutingMode.ROUTE_SEPARATION
            rationale = (
                f"Separation justified: predicted accuracy gain ({predicted_benefit:.2f}) "
                f"outweighs latency penalty ({self.lambda_param * norm_cost:.2f}), "
                f"net utility = +{utility:.2f}."
            )
        elif utility < -0.15:
            decision = RoutingMode.KEEP_MIXTURE
            rationale = (
                f"Mixture retained: expected benefit ({predicted_benefit:.2f}) "
                f"does not justify separation cost ({self.lambda_param * norm_cost:.2f}), "
                f"net utility = {utility:.2f}."
            )
        else:
            # Borderline case: if baseline ASR already had decent logprob, keep mixture
            if features["baseline_avg_logprob"] > -0.65:
                decision = RoutingMode.KEEP_MIXTURE
                rationale = (
                    f"Mixture retained: baseline transcription confidence is already high "
                    f"(logprob={features['baseline_avg_logprob']:.2f})."
                )
            else:
                decision = RoutingMode.ROUTE_SEPARATION
                rationale = (
                    f"Separation routed: borderline utility but baseline confidence is low "
                    f"(logprob={features['baseline_avg_logprob']:.2f})."
                )

        return RoutingDecision(
            region_id=region_id,
            start=start,
            end=end,
            decision=decision,
            predicted_benefit=round(predicted_benefit, 4),
            normalized_cost=round(norm_cost, 4),
            utility=round(utility, 4),
            features=features,
            rationale=rationale,
            lambda_param=self.lambda_param
        )


class OracleController(BaseController):
    """Retrospective Oracle: Upper-bound diagnostic selecting the optimal route via ground-truth references."""

    def __init__(self, ground_truth_wer_diffs: Optional[Dict[str, float]] = None):
        # ground_truth_wer_diffs: region_id -> (baseline_wer - separated_wer)
        self.ground_truth_wer_diffs = ground_truth_wer_diffs or {}

    def route_region(
        self,
        region: OverlapRegion,
        baseline_segments: list[TranscriptSegment],
        audio: np.ndarray,
        sr: int = 16000
    ) -> RoutingDecision:
        features = FeatureExtractor.extract_region_features(region, baseline_segments, audio, sr)
        wer_diff = self.ground_truth_wer_diffs.get(region.region_id, 0.0)

        # If separation actually reduced WER (wer_diff > 0), separate
        if wer_diff > 0.05:
            decision = RoutingMode.ROUTE_SEPARATION
            benefit = min(1.0, wer_diff)
            rationale = f"Oracle diagnostic: separation empirically improves WER by {wer_diff*100:.1f}%."
        else:
            decision = RoutingMode.KEEP_MIXTURE
            benefit = 0.0
            rationale = f"Oracle diagnostic: separation degrades or does not improve WER (delta={wer_diff*100:.1f}%)."

        return RoutingDecision(
            region_id=region.region_id,
            start=region.start,
            end=region.end,
            decision=decision,
            predicted_benefit=round(benefit, 4),
            normalized_cost=round(features["normalized_cost"], 4),
            utility=round(benefit - 0.5 * features["normalized_cost"], 4),
            features=features,
            rationale=rationale,
            lambda_param=0.5
        )
