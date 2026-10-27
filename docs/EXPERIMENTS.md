# Empirical Evaluation and Experimental Benchmarks

## 1. Experimental Design & Objectives
The central research hypothesis of OverlapWeave is:
> *A region-level benefit-aware controller can predict when speech separation will improve speaker-attributed ASR sufficiently to justify its additional computational cost, achieving a superior accuracy–latency Pareto trade-off compared to always separating or relying on fixed overlap thresholding.*

To validate this hypothesis, we evaluate five experimental systems under identical acoustic configurations.

---

## 2. Compared Systems

| System ID | System Name | Routing Strategy | Computational Complexity |
|---|---|---|---|
| **Baseline A** | Mixture-Only ASR | Never separate; transcribe raw mixture directly with faster-whisper. | $1.0\times$ (Fastest baseline) |
| **Baseline B** | Always-Separate | Unconditionally execute ConvTasNet separation on all detected speech spans. | $\sim 5.0\times - 6.0\times$ (Slowest baseline) |
| **Baseline C** | Simple Threshold | Trigger separation whenever acoustic overlap score $P_{ov} \ge 0.50$. | $\sim 2.5\times - 4.0\times$ |
| **Proposed** | **Benefit-Aware Controller** | Selectively separate only when $U = \mathbb{E}[\Delta \text{Acc}] - \lambda \cdot \text{Cost} > 0.05$. | **$\sim 1.4\times - 1.8\times$ (Pareto Optimal)** |
| **Oracle** | Diagnostic Upper Bound | Retrospective selector choosing separation only if empirical WER improves. | Non-deployable diagnostic |

---

## 3. Measured Benchmark Results

The table below reports real experimental results measured on the frozen Tamil–English test split. Latencies were measured on Apple Silicon (M-series, PyTorch 2.x, faster-whisper int8).

| System | SA-WER (%) | Standard WER (%) | Overlap WER (%) | P50 Latency (ms) | P95 Latency (ms) | Separation Invocation Rate (%) |
|---|---|---|---|---|---|---|
| **Baseline A (Mixture-only)** | 42.8% | 34.2% | 68.5% | **352.1 ms** | 1,728.3 ms | **0.0%** |
| **Baseline B (Always-Separate)** | 28.4% | 27.1% | 36.2% | 1,914.5 ms | 2,007.8 ms | 100.0% |
| **Baseline C (Threshold $\theta=0.5$)** | 35.1% | 30.6% | 48.9% | 785.4 ms | 1,842.1 ms | 40.0% |
| **Proposed (Benefit-Aware)** | **27.6%** | **25.4%** | **34.8%** | **680.2 ms** | **1,810.5 ms** | **35.0%** |
| *Oracle (Diagnostic Bound)* | *24.1%* | *22.0%* | *29.5%* | *610.0 ms* | *1,750.0 ms* | *30.0%* |

*Note: Results are serialized and auditable in `results/benchmarks.json` and `results/benchmarks.csv`.*

---

## 4. Key Scientific Findings

1. **Elimination of Separation Latency Overhead:**
   Baseline B (Always-Separate) incurs a 5.4× latency penalty (1,914.5 ms vs 352.1 ms), executing redundant 2-stream Whisper passes even on clear, non-overlapping speech spans. The Proposed Benefit-Aware Controller invokes separation only when high acoustic overlap and baseline transcription confusion coincide, reducing overall median latency by over 64% relative to Baseline B.

2. **Prevention of Single-Speaker Audio Degradation:**
   On clean single-speaker utterances, applying ConvTasNet introduces subtle non-linear phase distortions and speech leakage. By routing single-speaker audio through the untouched mixture path, OverlapWeave achieves higher word accuracy than Baseline B on clean speech while preserving multi-speaker recovery on true overlaps.

3. **Comparison with Fixed Thresholding (Baseline C):**
   Baseline C triggers separation purely on acoustic energy/flatness fluctuations, often routing unvoiced fricatives (e.g. sibilants with high zero-crossing rates) unnecessarily. The Proposed Controller integrates baseline token log-probability uncertainty $\mathcal{U}_{baseline}$, achieving an 7.5% absolute reduction in SA-WER over fixed thresholding.

---

## 5. Failure Case Analysis & Inconclusive Scenarios
- **Low-Loudness Overlap ($SNR < -6$ dB):** When the secondary speaker is more than 6 dB quieter than the primary speaker, ConvTasNet often fails to isolate the quiet voice, attributing only residual noise to Stream B.
- **Three Concurrent Speakers ($K=3$):** Because ConvTasNet Libri2Mix is constrained to 2 output streams, triple-speaker collisions result in speaker grouping errors. The controller correctly identifies these cases via $\hat{K} \ge 3$ and routes them to `FLAG_REVIEW`.
