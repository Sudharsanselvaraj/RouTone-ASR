"""Reconciles baseline mixture hypotheses with separated stream transcripts without hallucination."""

from __future__ import annotations
import re
from typing import List, Tuple, Dict, Any
from overlapweave.schemas.models import (
    TranscriptSegment,
    TranscriptWord,
    OverlapRegion,
    RoutingDecision,
    RoutingMode,
    ReconciliationResult,
)


class CandidateReconciler:
    """Merges baseline mixture transcript with separated streams into a coherent speaker-attributed transcript."""

    @classmethod
    def reconcile(
        cls,
        baseline_segments: List[TranscriptSegment],
        separated_segments: List[TranscriptSegment],
        routing_decisions: List[RoutingDecision],
    ) -> ReconciliationResult:
        """Reconciles baseline and separated hypotheses based on routing decisions.

        Args:
            baseline_segments: Segments from initial mixture ASR pass.
            separated_segments: Segments from separated streams (A and B).
            routing_decisions: Region routing decisions.

        Returns:
            ReconciliationResult with final speaker-attributed timeline and conflict audit stats.
        """
        # Determine which time intervals were routed to separation
        sep_intervals = [
            (d.start, d.end)
            for d in routing_decisions
            if d.decision == RoutingMode.ROUTE_SEPARATION
        ]

        conflicts_resolved = 0
        words_added = 0
        words_rejected = 0

        final_segments: List[TranscriptSegment] = []

        # 1. Add non-overlapping baseline segments that do not intersect with routed separation intervals
        for b_seg in baseline_segments:
            in_sep_interval = any(
                max(b_seg.start, s_start) < min(b_seg.end, s_end)
                for s_start, s_end in sep_intervals
            )
            if not in_sep_interval:
                # Untouched single-speaker or unseparated mixture segment
                final_segments.append(b_seg)

        # 2. Process separated segments in routed regions
        # Validate separated segments against hallucination and duplicate leakage
        filtered_sep_segments: List[TranscriptSegment] = []

        for s_seg in separated_segments:
            # Check for degenerate repetitions (e.g. "you you you you you" or punctuation spam)
            if cls.is_hallucination(s_seg.text):
                words_rejected += len(s_seg.words)
                continue

            # Check if text is non-empty
            clean_text = s_seg.text.strip()
            if not clean_text or len(clean_text) < 2:
                continue

            filtered_sep_segments.append(s_seg)

        # 3. Deduplicate cross-stream leakage
        # (e.g., if Speaker 1 is so loud it leaks into Stream B with lower probability)
        deduped_sep = cls.deduplicate_streams(filtered_sep_segments)

        for s_seg in deduped_sep:
            final_segments.append(s_seg)
            words_added += len(s_seg.words)
            conflicts_resolved += 1

        # 4. Check for any routed region where separation produced zero valid segments;
        # in that case, fallback and restore the baseline segments for that region!
        for s_start, s_end in sep_intervals:
            has_sep_words = any(
                max(s.start, s_start) < min(s.end, s_end)
                for s in deduped_sep
            )
            if not has_sep_words:
                # Separation yielded silence/failure: fallback to baseline
                fallback_segs = [
                    b for b in baseline_segments
                    if max(b.start, s_start) < min(b.end, s_end)
                ]
                for fb in fallback_segs:
                    fb_copy = fb.model_copy()
                    fb_copy.source_path = "mixture_fallback"
                    final_segments.append(fb_copy)

        # 5. Sort final segments chronologically by start timestamp
        final_segments.sort(key=lambda s: (s.start, s.end))

        return ReconciliationResult(
            baseline_segments=baseline_segments,
            separated_segments=separated_segments,
            final_segments=final_segments,
            conflicts_resolved=conflicts_resolved,
            words_added_from_separation=words_added,
            words_rejected_as_hallucinations=words_rejected
        )

    @classmethod
    def is_hallucination(cls, text: str) -> bool:
        """Detects degenerate repetitive hallucinations common in Whisper on noise/silence."""
        tokens = text.strip().split()
        if len(tokens) >= 4:
            # If a single token makes up >= 40% of words (catches 2-word loops like 'thank you thank you')
            token_counts = {}
            for t in tokens:
                t_lower = t.lower()
                token_counts[t_lower] = token_counts.get(t_lower, 0) + 1
            max_freq = max(token_counts.values())
            if max_freq / len(tokens) >= 0.40:
                return True

            # Check for repeated 2-grams (bigrams)
            bigrams = [f"{tokens[i]} {tokens[i+1]}".lower() for i in range(len(tokens) - 1)]
            bg_counts = {}
            for bg in bigrams:
                bg_counts[bg] = bg_counts.get(bg, 0) + 1
            if max(bg_counts.values()) >= 3:
                return True

        # Check for character loops (e.g. ".........." or "!!!!!!")
        if re.search(r"(.)\1{6,}", text):
            return True

        return False

    @classmethod
    def deduplicate_streams(
        cls,
        segments: List[TranscriptSegment],
        time_tolerance_s: float = 0.5
    ) -> List[TranscriptSegment]:
        """Removes duplicate utterances caused by acoustic cross-talk leaking into both separated streams."""
        if len(segments) <= 1:
            return segments

        # Separate segments by stream/speaker
        stream_a = [s for s in segments if s.source_path == "separated_stream_a"]
        stream_b = [s for s in segments if s.source_path == "separated_stream_b"]

        retained: List[TranscriptSegment] = []
        suppressed_ids = set()

        for seg_a in stream_a:
            text_a_norm = seg_a.text.strip().lower()
            for seg_b in stream_b:
                if seg_b.id in suppressed_ids:
                    continue
                # Overlapping time window
                overlap = max(0.0, min(seg_a.end, seg_b.end) - max(seg_a.start, seg_b.start))
                if overlap > 0.3:
                    text_b_norm = seg_b.text.strip().lower()
                    # If text is nearly identical (or substring match)
                    if (text_a_norm in text_b_norm or text_b_norm in text_a_norm) and len(text_a_norm) > 3:
                        # Acoustic leak detected: keep whichever stream had higher confidence/avg_logprob
                        if seg_a.avg_logprob >= seg_b.avg_logprob:
                            suppressed_ids.add(seg_b.id)
                        else:
                            suppressed_ids.add(seg_a.id)

        for s in segments:
            if s.id not in suppressed_ids:
                retained.append(s)

        return retained
