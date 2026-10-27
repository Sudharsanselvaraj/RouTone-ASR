# OverlapWeave: System Architecture

## 1. Architectural Blueprint

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|  (React 18 + Vite + TypeScript + Tailwind-free Custom Theme + Wavesurfer / Audio)  |
|  - ASR Studio        - Overlap Inspector    - Routing Lab       - Benchmarks      |
+------------------------------------------+----------------------------------------+
                                           | HTTP / REST (Multipart Audio, JSON)
                                           v
+-----------------------------------------------------------------------------------+
|                            FASTAPI BACKEND SERVICE                                |
|  Routes: /api/transcribe, /api/overlap, /api/separate, /api/route, /api/benchmarks|
+------------------------------------------+----------------------------------------+
                                           |
    +--------------------------------------+-----------------------------------+
    |                                      |                                   |
    v                                      v                                   v
+-----------------------+      +-----------------------+     +----------------------+
|   Audio Ingestion     |      |   Overlap Detector    |     |   Baseline ASR       |
|  - FFmpeg / soundfile |      |  - Energy Fluctuations|     |  - faster-whisper    |
|  - 16 kHz Mono Resample|     |  - Harmonic collisions|     |  - Segment & Word TS |
|  - Signal validation  |      |  - Multi-speaker score|     |  - Confidence / LogP |
+-----------+-----------+      +-----------+-----------+     +----------+-----------+
            |                              |                            |
            +------------------------------+----------------------------+
                                           |
                                           v
            +-----------------------------------------------------------+
            |        ADAPTIVE BENEFIT-AWARE SEPARATION CONTROLLER        |
            |  Feature Extractor:                                       |
            |    - Overlap duration ($T_{ov}$), Overlap Score ($P_{ov}$) |
            |    - Baseline perplexity / avg logprob                    |
            |    - Energy imbalance ratio (dB)                          |
            |    - Estimated compute cost ($\tau_{sep}$)                |
            |  Decision Function:                                       |
            |    $U = \mathbb{E}[\Delta \text{WER}] - \lambda \cdot Cost$|
            |  Outputs: ROUTE_SEPARATION | KEEP_MIXTURE | FLAG_REVIEW   |
            +------------------------------+----------------------------+
                                           |
                     +---------------------+---------------------+
                     | ROUTE_SEPARATION                          | KEEP_MIXTURE
                     v                                           v
+-----------------------------------------+       +---------------------------------+
|     Speech Separation Module            |       |    Mixture Hypothesis Path      |
|  - Pretrained ConvTasNet (torchaudio)   |       |  - Keep Baseline Segment Hyp.   |
|  - 8kHz -> 16kHz resampled streams      |       +---------------------------------+
|  - Stream A & Stream B extraction       |                      |
+--------------------+--------------------+                      |
                     |                                           |
                     v                                           |
+-----------------------------------------+                      |
|       Stream ASR & Attribution          |                      |
|  - Transcribe Stream A ($S_A$)          |                      |
|  - Transcribe Stream B ($S_B$)          |                      |
+--------------------+--------------------+                      |
                     |                                           |
                     +---------------------+---------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                          CANDIDATE RECONCILIATION ENGINE                          |
|  - Temporal interval alignment & Dynamic Programming Matching                     |
|  - Hypothesis selection via acoustic likelihood & cross-stream deduplication      |
|  - Code-switch preservation (Tamil script + English terms)                        |
|  - Attribution assignment: [Speaker 1 / Speaker 2]                                |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
                               Final Attributed Transcript
                                    & Audit Metadata
```

---

## 2. Component Design Specifications

### A. `overlapweave.audio`
- **Module:** `audio.processor`
- **Responsibilities:**
  - Ingest raw audio payload (WAV, MP3, FLAC, M4A, WebM).
  - Decode without writing non-ephemeral files or corrupting originals.
  - Resample to canonical 16,000 Hz, single channel (mono) float32.
  - Compute audio diagnostics: Duration (sec), RMS energy, Peak amplitude, Dynamic range, Signal-to-Noise Ratio (SNR) estimate.
  - Window extraction with symmetric padding for boundary protection.

### B. `overlapweave.asr`
- **Module:** `asr.whisper_engine`
- **Responsibilities:**
  - Wrap `faster-whisper` with automatic hardware acceleration (`cpu`, `mps` if supported, int8 quantization for ultra-fast inference).
  - Produce normalized segments with start/end timestamps, text, detected language (`ta` / `en`), and word-level timing when enabled.
  - Calculate average token log-probability as a proxy for baseline recognition uncertainty.

### C. `overlapweave.overlap`
- **Module:** `overlap.detector`
- **Responsibilities:**
  - Frame-level feature extraction: Short-time energy variance, zero-crossing rate variance, multi-pitch harmonic clash indicator.
  - Multi-speaker overlap candidate region extraction with hysteresis thresholding and minimum duration merging ($\ge 0.3$s).
  - Produce intervals with start, end, overlap confidence $[0.0, 1.0]$, and estimated speaker count.

### D. `overlapweave.separation`
- **Module:** `separation.separator`
- **Responsibilities:**
  - Wrap `torchaudio.pipelines.CONVTASNET_BASE_LIBRI2MIX`.
  - Handle rate conversion: Resample 16kHz mixture region to 8kHz $\rightarrow$ ConvTasNet $\rightarrow$ Resample separated streams back to 16kHz.
  - Windowed chunk processing with Hann/cosine overlap-add crossfade for long regions to avoid block boundary clicks.
  - Strict fallback: If separation encounters numerical instability or out-of-bounds energy, gracefully return baseline mixture stream.

### E. `overlapweave.routing`
- **Module:** `routing.controller`
- **Responsibilities:**
  - Calculate acoustic and linguistic decision features:
    $f_1 = \text{overlap\_score}$, $f_2 = \text{overlap\_duration}$, $f_3 = \text{baseline\_logprob}$, $f_4 = \text{energy\_ratio\_db}$.
  - Compute utility metric against penalty parameter $\lambda$:
    $\text{Benefit} = \sigma(w^T f + b)$, $\text{Cost} = \tau_{sep} / \tau_{max}$.
  - Support three controller modes:
    1. `ThresholdController` (Baseline C): simple cutoff $f_1 \ge \theta$.
    2. `BenefitAwareController` (Proposed): utility thresholding with cost awareness.
    3. `OracleController` (Diagnostic Upper Bound): retrospective oracle using ground-truth references.

### F. `overlapweave.reconciliation`
- **Module:** `reconciliation.reconciler`
- **Responsibilities:**
  - Align baseline transcript tokens with separated $S_A$ and $S_B$ tokens.
  - Avoid duplicates (e.g. if one speaker's loud voice is picked up in both separated streams with slight time jitter).
  - Tag each segment with speaker ID (`Speaker 1`, `Speaker 2`), confidence score, and processing provenance (`mixture` vs `separated_stream_a` vs `separated_stream_b`).
  - Strict anti-hallucination policy: No words inserted that lack acoustic backing.

### G. `overlapweave.evaluation`
- **Module:** `evaluation.metrics` & `evaluation.harness`
- **Responsibilities:**
  - Compute Speaker-Attributed Word Error Rate (SA-WER), standard WER, Overlap-region WER (OV-WER), and Per-speaker recall.
  - Benchmark all 4 systems under deterministic seeds.
  - Track P50/P90 latency and Separation Invocation Rate (SIR).
