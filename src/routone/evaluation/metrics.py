"""Speaker-attributed WER, overlap WER, speaker recall, and latency evaluation metrics."""

from __future__ import annotations
import re
from typing import List, Dict, Any, Tuple
import numpy as np
import jiwer

from routone.schemas.models import TranscriptSegment


class EvaluationMetrics:
    """Calculates standardized speech recognition and speaker attribution metrics."""

    @staticmethod
    def normalize_text(text: str) -> str:
        """Standardizes punctuation, casing, and whitespace for fair Levenshtein scoring."""
        text = text.lower()
        # Remove common punctuation while preserving Tamil and Latin unicode characters
        text = re.sub(r"[^\w\s\u0B80-\u0BFF]", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @classmethod
    def compute_standard_wer(cls, reference: str, hypothesis: str) -> float:
        """Computes Word Error Rate between reference and hypothesis text.

        Raises:
            ValueError: If the reference is empty. WER is undefined without reference words; returning a
                number (0.0 or 1.0) would silently produce a misleading score.
        """
        ref_clean = cls.normalize_text(reference)
        hyp_clean = cls.normalize_text(hypothesis)

        if not ref_clean:
            raise ValueError("WER is undefined for an empty reference transcript.")
        if not hyp_clean:
            # Every reference word is a deletion: WER is exactly 1.0 (callers should flag empty hypotheses).
            return 1.0

        try:
            return float(jiwer.wer(ref_clean, hyp_clean))
        except Exception:
            # Fallback simple word Levenshtein
            ref_words = ref_clean.split()
            hyp_words = hyp_clean.split()
            return float(cls._word_levenshtein_distance(ref_words, hyp_words) / max(1, len(ref_words)))

    @classmethod
    def compute_speaker_attributed_wer(
        cls,
        references_by_speaker: Dict[str, str],
        hypotheses: List[TranscriptSegment]
    ) -> Tuple[float, Dict[str, float], Dict[str, float]]:
        """Computes Speaker-Attributed Word Error Rate (SA-WER) and per-speaker recall.

        Args:
            references_by_speaker: Mapping of speaker name (e.g. 'Speaker 1', 'Speaker 2') to ground-truth text.
            hypotheses: Output segments from ASR pipeline with speaker attribution.

        Returns:
            Tuple of:
              - sa_wer: Overall speaker-attributed WER
              - per_speaker_wer: Dict mapping speaker to their specific WER
              - per_speaker_recall: Dict mapping speaker to word recall rate
        """
        # Group hypothesis text by attributed speaker
        hyp_by_speaker: Dict[str, List[str]] = {spk: [] for spk in references_by_speaker}

        for seg in hypotheses:
            spk = seg.speaker if seg.speaker in references_by_speaker else "Speaker 1"
            if spk in hyp_by_speaker:
                hyp_by_speaker[spk].append(seg.text)

        total_ref_words = 0
        total_errors = 0
        per_speaker_wer: Dict[str, float] = {}
        per_speaker_recall: Dict[str, float] = {}

        for spk, ref_text in references_by_speaker.items():
            ref_clean = cls.normalize_text(ref_text)
            hyp_text = " ".join(hyp_by_speaker.get(spk, []))
            hyp_clean = cls.normalize_text(hyp_text)

            ref_words = ref_clean.split()
            hyp_words = hyp_clean.split()

            ref_count = len(ref_words)
            total_ref_words += ref_count

            if ref_count == 0:
                # No reference for this speaker: their WER/recall are unavailable, not perfect.
                continue

            dist = cls._word_levenshtein_distance(ref_words, hyp_words)
            total_errors += dist
            spk_wer = min(2.0, float(dist / ref_count))
            per_speaker_wer[spk] = round(spk_wer, 4)

            # Word recall: matched words / reference words
            # Count common word intersections
            ref_set = set(ref_words)
            matched = sum(1 for w in hyp_words if w in ref_set)
            recall = min(1.0, float(matched / ref_count))
            per_speaker_recall[spk] = round(recall, 4)

        if total_ref_words == 0:
            raise ValueError("SA-WER is undefined: no speaker has any reference words.")
        overall_sa_wer = round(min(2.0, float(total_errors / total_ref_words)), 4)
        return overall_sa_wer, per_speaker_wer, per_speaker_recall

    @classmethod
    def compute_overlap_wer(
        cls,
        overlap_start: float,
        overlap_end: float,
        ref_overlap_text: str,
        hypotheses: List[TranscriptSegment]
    ) -> float:
        """Computes WER restricted to the overlapping audio interval."""
        # Collect hypothesis segments intersecting with overlap interval
        overlap_hyp_words = []
        for seg in hypotheses:
            if max(seg.start, overlap_start) < min(seg.end, overlap_end):
                overlap_hyp_words.append(seg.text)

        hyp_text = " ".join(overlap_hyp_words)
        return cls.compute_standard_wer(ref_overlap_text, hyp_text)

    @staticmethod
    def _word_levenshtein_distance(ref: List[str], hyp: List[str]) -> int:
        """Dynamic programming Levenshtein edit distance over word tokens."""
        n, m = len(ref), len(hyp)
        dp = [[0] * (m + 1) for _ in range(n + 1)]

        for i in range(n + 1):
            dp[i][0] = i
        for j in range(m + 1):
            dp[0][j] = j

        for i in range(1, n + 1):
            for j in range(1, m + 1):
                if ref[i - 1] == hyp[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1]
                else:
                    dp[i][j] = 1 + min(
                        dp[i - 1][j],      # deletion
                        dp[i][j - 1],      # insertion
                        dp[i - 1][j - 1]   # substitution
                    )

        return dp[n][m]

    @classmethod
    def count_words(cls, text: str) -> int:
        return len(cls.normalize_text(text).split())

    @staticmethod
    def pareto_front(points: Dict[str, Tuple[float, float]]) -> List[str]:
        """Names whose (error, latency) point is not dominated by any other point (both minimized).

        A point dominates another if it is <= in both coordinates and < in at least one.
        """
        front: List[str] = []
        for name, (err, lat) in points.items():
            dominated = any(
                (e2 <= err and l2 <= lat) and (e2 < err or l2 < lat)
                for other, (e2, l2) in points.items() if other != name
            )
            if not dominated:
                front.append(name)
        return front

    @staticmethod
    def compute_latency_percentiles(latencies_ms: List[float]) -> Tuple[float, float, float]:
        """Calculates P50, P90, and P95 latency percentiles from list of measurements."""
        if not latencies_ms:
            return 0.0, 0.0, 0.0
        p50 = float(np.percentile(latencies_ms, 50))
        p90 = float(np.percentile(latencies_ms, 90))
        p95 = float(np.percentile(latencies_ms, 95))
        return round(p50, 1), round(p90, 1), round(p95, 1)
