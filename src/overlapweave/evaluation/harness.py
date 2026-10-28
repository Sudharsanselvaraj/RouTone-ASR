"""Benchmark evaluation harness comparing the primary experimental systems.

Integrity rules enforced here:
  * Only strategies that actually ran are reported (the Oracle needs per-region ground truth and is
    reported as "not evaluated" unless such ground truth is supplied).
  * Quantities that are undefined (e.g. separation rate with zero detected regions) are ``None``, not 0.
  * Reports carry a ``status`` ('valid' / 'invalid' / 'incomplete') plus the concrete reasons.
  * No narrative claim ("optimal", "faster") is emitted unless it follows from the measured numbers.
"""

from __future__ import annotations
import csv
import json
import os
import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import numpy as np

from overlapweave.schemas.models import (
    EvaluationMetricSummary,
    BenchmarkReport,
    RoutingMode,
)
from overlapweave.pipeline import OverlapWeavePipeline
from overlapweave.routing.controller import (
    ThresholdController,
    BenefitAwareController,
    OracleController,
    BaseController,
)
from overlapweave.routing.policies import AlwaysSeparateController, NeverSeparateController  # noqa: F401  (re-exported)
from overlapweave.evaluation.metrics import EvaluationMetrics
from overlapweave.evaluation.synthetic_generator import SyntheticDatasetGenerator
from overlapweave.evaluation.tts_dataset import TTSDatasetGenerator

MIN_SAMPLES_FOR_CLAIMS = 30

DEFINITIONS = {
    "standard_wer": "WER of concatenated final transcript vs. concatenation of Speaker 1 and Speaker 2 references (speaker labels ignored).",
    "speaker_attributed_wer": "Sum of per-speaker word edit distances / total reference words, with hypothesis text grouped by predicted speaker label and NO speaker-permutation search. Baseline mixture output carries a single label, so this is stricter than cpWER.",
    "overlap_wer": "Proxy: Speaker 2's full reference vs. the text of hypothesis segments intersecting the planted overlap window. Reference words are not time-aligned, so this is a diagnostic, not a true region-level WER.",
    "latency": "Wall-clock of one full pipeline pass per sample (baseline ASR + overlap detection + routing + selected separation + stream ASR + reconciliation), after one discarded warm-up pass.",
    "separation_invocation_rate": "Regions routed to separation / regions detected. Undefined (None) when no region was detected.",
}


class BenchmarkHarness:
    """Executes comparative evaluation across the routing strategies."""

    def __init__(self, output_dir: str = "results"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        self.pipeline = OverlapWeavePipeline()

    @staticmethod
    def load_dataset(dataset: str = "auto") -> Dict[str, Any]:
        """Returns {'name', 'samples'}; 'auto' prefers real-speech TTS mixtures when available."""
        if dataset in ("auto", "tts") and TTSDatasetGenerator.available():
            return {"name": TTSDatasetGenerator.DATASET_NAME, "samples": TTSDatasetGenerator.get_dataset("test")}
        if dataset == "tts":
            raise RuntimeError("TTS dataset requested but macOS 'say' is not available on this platform.")
        return {
            "name": "Tamil-English Synthetic Overlap Test Set (v1.0, harmonic tones)",
            "samples": SyntheticDatasetGenerator.get_dataset(split="test"),
        }

    def run_benchmark(
        self,
        samples: Optional[List[Dict[str, Any]]] = None,
        save_results: bool = True,
        dataset: str = "auto",
        dataset_name: Optional[str] = None,
        oracle_wer_diffs: Optional[Dict[str, float]] = None,
        lambda_param: float = 0.45,
        threshold: float = 0.50,
    ) -> BenchmarkReport:
        """Runs the benchmark suite across all strategies.

        Args:
            samples: Evaluation samples; if None, ``dataset`` selects them.
            save_results: If True, writes JSON and CSV files to output_dir.
            dataset: 'auto' | 'tts' | 'synthetic' (ignored when ``samples`` is given).
            oracle_wer_diffs: Optional region_id -> (baseline_wer - separated_wer). Without it the Oracle
                is not evaluated (an Oracle with no ground truth is just Baseline A).
        """
        if samples is None:
            loaded = self.load_dataset(dataset)
            samples = loaded["samples"]
            dataset_name = dataset_name or loaded["name"]
        dataset_name = dataset_name or "Custom samples"

        systems: Dict[str, BaseController] = {
            "Baseline A (Mixture-only)": NeverSeparateController(),
            "Baseline B (Always-Separate)": AlwaysSeparateController(),
            f"Baseline C (Threshold theta={threshold:g})": ThresholdController(threshold=threshold),
            "Proposed (Benefit-Aware)": BenefitAwareController(lambda_param=lambda_param),
        }
        not_evaluated: Dict[str, str] = {}
        if oracle_wer_diffs:
            systems["Oracle (Diagnostic Bound)"] = OracleController(ground_truth_wer_diffs=oracle_wer_diffs)
        else:
            not_evaluated["Oracle (Diagnostic Bound)"] = (
                "Requires per-region ground-truth WER deltas (baseline vs. separated), which this dataset does not provide."
            )

        warnings: List[str] = []

        # Reference availability: WER is undefined for empty references, so such samples are excluded (and counted).
        usable, skipped = [], []
        for smp in samples:
            refs = smp.get("references", {})
            if any(EvaluationMetrics.count_words(t) > 0 for t in refs.values()):
                usable.append(smp)
            else:
                skipped.append(smp.get("id", "?"))
        if skipped:
            warnings.append(f"{len(skipped)} sample(s) skipped: empty reference transcript ({', '.join(skipped)}).")

        # Warm-up so model loading is not billed to the first strategy's latency.
        if usable:
            self.pipeline.process_audio(usable[0]["mixture_audio"], controller_override=NeverSeparateController())

        summaries: List[EvaluationMetricSummary] = []
        transcript_fingerprints: Dict[str, List[str]] = {}

        for name, controller in systems.items():
            latencies: List[float] = []
            sa_wers: List[float] = []
            std_wers: List[float] = []
            ov_wers: List[float] = []
            spk_recalls: Dict[str, List[float]] = {}
            total_regions = separated_regions = 0
            ref_words = hyp_words = empty_hyp = 0
            errors: List[str] = []
            fingerprints: List[str] = []

            for smp in usable:
                refs = smp["references"]
                try:
                    t0 = time.perf_counter()
                    res = self.pipeline.process_audio(smp["mixture_audio"], controller_override=controller)
                    lat_ms = (time.perf_counter() - t0) * 1000.0

                    hyp_text = " ".join(s.text for s in res.final_transcript)
                    full_ref = " ".join(t for t in refs.values() if t)
                    sa_wer, _, per_spk_recall = EvaluationMetrics.compute_speaker_attributed_wer(
                        references_by_speaker=refs, hypotheses=res.final_transcript
                    )
                    std = EvaluationMetrics.compute_standard_wer(full_ref, hyp_text)
                    ov_ref = refs.get("Speaker 2", "")
                    ov = (
                        EvaluationMetrics.compute_overlap_wer(
                            smp["overlap_start"], smp["overlap_end"], ov_ref, res.final_transcript
                        )
                        if EvaluationMetrics.count_words(ov_ref) > 0 else None
                    )
                except Exception as exc:  # a failed sample must be visible, never silently scored
                    errors.append(f"{smp.get('id', '?')}: {exc}")
                    continue

                latencies.append(lat_ms)
                sa_wers.append(sa_wer)
                std_wers.append(std)
                if ov is not None:
                    ov_wers.append(ov)
                for spk, rec in per_spk_recall.items():
                    spk_recalls.setdefault(spk, []).append(rec)
                total_regions += len(res.detected_overlaps)
                separated_regions += sum(
                    1 for d in res.routing_decisions if d.decision == RoutingMode.ROUTE_SEPARATION
                )
                ref_words += EvaluationMetrics.count_words(full_ref)
                n_hyp = EvaluationMetrics.count_words(hyp_text)
                hyp_words += n_hyp
                empty_hyp += int(n_hyp == 0)
                fingerprints.append(EvaluationMetrics.normalize_text(hyp_text))

            transcript_fingerprints[name] = fingerprints
            n_ok = len(latencies)
            notes: List[str] = list(errors and [f"{len(errors)} sample(s) failed: " + "; ".join(errors)] or [])
            if n_ok == 0:
                notes.append("No sample completed; metrics unavailable.")
            if empty_hyp:
                notes.append(f"{empty_hyp}/{n_ok} sample(s) produced an empty hypothesis (WER=1.0 means 'nothing recognized').")
            valid = n_ok > 0 and empty_hyp < n_ok

            p50, p90, p95 = EvaluationMetrics.compute_latency_percentiles(latencies)
            summaries.append(EvaluationMetricSummary(
                method_name=name,
                speaker_attributed_wer=round(float(np.mean(sa_wers)), 4) if sa_wers else 0.0,
                standard_wer=round(float(np.mean(std_wers)), 4) if std_wers else 0.0,
                overlap_wer=round(float(np.mean(ov_wers)), 4) if ov_wers else 0.0,
                speaker_recalls={k: round(float(np.mean(v)), 4) for k, v in spk_recalls.items()},
                p50_latency_ms=p50,
                p90_latency_ms=p90,
                p95_latency_ms=p95,
                separation_invocation_rate=(round(separated_regions / total_regions, 3) if total_regions else None),
                total_regions_processed=total_regions,
                evaluated_samples_count=n_ok,
                reference_word_count=ref_words,
                hypothesis_word_count=hyp_words,
                empty_hypothesis_samples=empty_hyp,
                separated_regions=separated_regions,
                latency_ms_samples=[round(x, 1) for x in latencies],
                valid=valid,
                notes=notes,
            ))

        # ---- report-level integrity checks -------------------------------------------------------
        contains_speech = all(bool(s.get("contains_speech", False)) for s in usable) if usable else False
        sources = sorted({str(s.get("audio_source", "unknown")) for s in usable})
        n_eval = max((m.evaluated_samples_count for m in summaries), default=0)
        any_regions = any(m.total_regions_processed > 0 for m in summaries)
        any_valid = any(m.valid for m in summaries)

        invalid_reasons: List[str] = []
        if not usable:
            invalid_reasons.append("No sample with a non-empty reference transcript was available.")
        if usable and not contains_speech:
            invalid_reasons.append(
                "The evaluated audio does not contain speech (harmonic-tone synthesis), so the reference transcripts "
                "are not what was 'spoken'. WER against these references is not a measure of recognition quality."
            )
        if usable and not any_valid:
            invalid_reasons.append("Every strategy produced an empty hypothesis on every sample.")
        if n_eval == 0 and usable:
            invalid_reasons.append("No sample completed for any strategy.")

        incomplete_reasons: List[str] = []
        if usable and not any_regions:
            incomplete_reasons.append(
                "The overlap detector found no candidate regions in any sample, so routing never had a decision to make "
                "and all strategies reduce to the same pipeline; differences are measurement noise."
            )
        if any(m.notes and not m.valid for m in summaries) and any_valid:
            incomplete_reasons.append("One or more strategies have no valid measurements.")
        if not_evaluated:
            incomplete_reasons.append("Not evaluated: " + ", ".join(not_evaluated))

        identical = (
            len(transcript_fingerprints) > 1
            and n_eval > 0
            and len({tuple(v) for v in transcript_fingerprints.values()}) == 1
        )
        if identical:
            warnings.append("All strategies produced identical transcripts on every sample: no accuracy difference is attributable to routing.")
        if 0 < n_eval < MIN_SAMPLES_FOR_CLAIMS:
            warnings.append(
                f"Only {n_eval} sample(s) were evaluated: differences are not statistically meaningful, and P90/P95 latency "
                f"over {n_eval} run(s) is not a meaningful percentile."
            )
        warnings.extend(invalid_reasons)
        warnings.extend(r for r in incomplete_reasons if r not in warnings)

        status = "invalid" if invalid_reasons else ("incomplete" if incomplete_reasons else "valid")

        front: List[str] = []
        if status != "invalid":
            pts = {m.method_name: (m.speaker_attributed_wer, m.p50_latency_ms) for m in summaries if m.valid}
            front = EvaluationMetrics.pareto_front(pts)

        report = BenchmarkReport(
            timestamp=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            dataset_name=dataset_name,
            results=summaries,
            pareto_optimal_system=(" | ".join(front) if front else "Not determined"),
            summary_analysis=self._summarize(status, summaries, front, n_eval, identical, invalid_reasons),
            status=status,
            warnings=warnings,
            pareto_front=front,
            dataset={
                "contains_speech": contains_speech,
                "audio_sources": sources,
                "samples_total": len(samples),
                "samples_evaluated": n_eval,
                "samples_skipped_empty_reference": skipped,
                "sample_ids": [s.get("id") for s in usable],
                "references_available": bool(usable),
                "reference_words": sum(
                    EvaluationMetrics.count_words(t) for s in usable for t in s["references"].values()
                ),
            },
            not_evaluated=not_evaluated,
            config={
                "asr_model": self.pipeline.asr_engine.model_size,
                "lambda_param": lambda_param,
                "threshold": threshold,
                "warmup_pass": True,
                "definitions": DEFINITIONS,
            },
        )

        if save_results:
            self._save_report(report)
        return report

    @staticmethod
    def _summarize(
        status: str,
        summaries: List[EvaluationMetricSummary],
        front: List[str],
        n_eval: int,
        identical: bool,
        invalid_reasons: List[str],
    ) -> str:
        """Factual summary computed from the measurements; makes no superiority claim."""
        if status == "invalid":
            return "This experiment is invalid and supports no conclusion about recognition accuracy or routing. " + " ".join(invalid_reasons)
        parts = [f"{len(summaries)} strateg{'y' if len(summaries) == 1 else 'ies'} evaluated on {n_eval} sample(s)."]
        if identical:
            parts.append("All strategies produced identical transcripts, so no accuracy difference can be attributed to routing.")
        by_wer = sorted((m for m in summaries if m.valid), key=lambda m: m.speaker_attributed_wer)
        if by_wer and not identical:
            best = by_wer[0]
            parts.append(f"Lowest measured SA-WER: {best.method_name} ({best.speaker_attributed_wer * 100:.1f}%).")
        if n_eval < MIN_SAMPLES_FOR_CLAIMS:
            parts.append(f"With n={n_eval}, no difference should be read as significant.")
        if front:
            parts.append("Non-dominated on (SA-WER, median latency): " + ", ".join(front) + ".")
        return " ".join(parts)

    def _save_report(self, report: BenchmarkReport) -> None:
        """Saves machine-readable JSON and CSV files."""
        # 1. JSON
        json_path = os.path.join(self.output_dir, "benchmarks.json")
        with open(json_path, "w", encoding="utf-8") as f:
            f.write(report.model_dump_json(indent=2))

        # Timestamped copy so earlier runs stay inspectable (experiment history).
        hist_dir = os.path.join(self.output_dir, "history")
        os.makedirs(hist_dir, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        with open(os.path.join(hist_dir, f"bench_{stamp}.json"), "w", encoding="utf-8") as f:
            f.write(report.model_dump_json(indent=2))

        # 2. CSV
        csv_path = os.path.join(self.output_dir, "benchmarks.csv")
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Method",
                "SA_WER",
                "Standard_WER",
                "Overlap_WER",
                "Speaker1_Recall",
                "Speaker2_Recall",
                "P50_Latency_ms",
                "P95_Latency_ms",
                "Separation_Invocation_Rate",
                "Samples_Evaluated",
                "Report_Status"
            ])
            for s in report.results:
                writer.writerow([
                    s.method_name,
                    s.speaker_attributed_wer,
                    s.standard_wer,
                    s.overlap_wer,
                    s.speaker_recalls.get("Speaker 1", ""),
                    s.speaker_recalls.get("Speaker 2", ""),
                    s.p50_latency_ms,
                    s.p95_latency_ms,
                    "" if s.separation_invocation_rate is None else s.separation_invocation_rate,
                    s.evaluated_samples_count,
                    report.status
                ])
