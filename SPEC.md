# SPEC.md: Routone Technical Specification

## 1. System Identity and Vision
**System Name:** Routone  
**Subtitle:** Benefit-Aware Adaptive Speech Separation for Speaker-Attributed ASR in Overlapping Tamil–English Conversations  

### Objective
In natural multi-party conversations—especially code-switching multilingual settings like Tamil–English (Tanglish)—speakers regularly overlap (interrupt, agree, backchannel, talk concurrently). Standard ASR backends (e.g. Whisper) omit interleaved voices, mix up word order, or drop words from the secondary speaker. Blindly executing deep speech separation across every audio clip is computationally expensive (~5–10x latency overhead) and often introduces audible non-linear distortions that can degrade ASR on clear, non-overlapping regions.

Routone solves this by introducing a **Benefit-Aware Adaptive Separation Controller**. The controller analyzes short acoustic and transcription cues from candidate overlap regions and estimates the expected utility:
$$\text{utility} = \Delta \text{Accuracy} - \lambda \cdot \text{Normalized Additional Cost}$$
Speech separation is selectively routed only when the predicted recognition benefit outweighs the latency penalty.

---

## 2. Core Functional Specifications

### A. Audio Ingestion & Signal Normalization
- **Supported Formats:** WAV, MP3, FLAC, M4A, WebM (decoded via FFmpeg/soundfile/librosa).
- **Working Standard:** 16,000 Hz, 16-bit mono PCM representation stored without modifying original recordings.
- **Safety Checks:** Duration sanity bounds (0.5s to 300s for interactive, configurable for batch), file size limits, signal clipping and SNR checks.

### B. Baseline ASR Engine
- **Engine:** `faster-whisper` (`tiny`, `base`, `small`, or `medium` checkpoint).
- **Language Support:** English (`en`), Tamil (`ta`), and automatic language detection / multilingual code-switching.
- **Outputs:** Segment and word-level timestamps, log-probability scores, language classification, inference duration.

### C. Overlap Detection Module
- **Mechanism:** Dual-stage detector:
  1. Energy/spectral fluctuation & zero-crossing rate variance across sliding windows (lightweight acoustic overlap heuristic).
  2. Pitch contour multi-harmonic analysis / Voice Activity Density estimator indicating multi-speaker likelihood.
- **Output Schema:** 
  ```json
  [
    {
      "region_id": "reg_0",
      "start": 1.25,
      "end": 3.40,
      "overlap_score": 0.78,
      "speaker_count_estimate": 2,
      "snr_estimate_db": 14.2
    }
  ]
  ```

### D. Speech Separation Engine
- **Model Adapter:** Real PyTorch-based speech separation supporting 2-speaker stream demixing:
  - Deep ConvTasNet / SepFormer / Asteroid adapter with robust graceful fallback.
  - Windowed chunk processing with cosine taper cross-fade overlap reconstruction to avoid boundary discontinuities.
- **Diagnostics:** Separation duration (ms), RMS energy ratio between separated channels, failure fallback flag.

### E. Speaker-Attributed ASR & Reconciliation
- **Transcription of Streams:** Baseline stream ($S_0$) vs. Separated streams ($S_A, S_B$).
- **Reconciliation Logic:**
  - Token-level alignment with dynamic time warping / interval overlap matching.
  - Hypotheses conflict arbitration based on acoustic log-likelihood and phoneme density.
  - No synthetic hallucinations: words must be supported by acoustic evidence.

### F. Adaptive Benefit-Aware Controller
- **Feature Extraction:**
  1. Overlap duration ($T_{ov}$).
  2. Overlap confidence score ($P_{ov}$).
  3. Baseline ASR token perplexity / average logprob in the overlap segment.
  4. Speaker energy ratio (imbalance estimate).
  5. Expected computation latency penalty ($\tau_{sep}$).
- **Decision Engine:**
  - `Baseline C`: Fixed overlap threshold ($\theta = 0.50$).
  - `Proposed Controller`: Calibrated linear/logistic benefit predictor computing $\mathbb{E}[\Delta \text{WER}] - \lambda \cdot \text{Cost}$, outputting `{ROUTE_SEPARATION, KEEP_MIXTURE, FLAG_REVIEW}`.

---

## 3. Data Contracts and Schemas

### Transcription Segment Schema
```json
{
  "start": 1.25,
  "end": 2.80,
  "speaker": "Speaker 1",
  "text": "வணக்கம் how are you doing today?",
  "language": "ta",
  "confidence": 0.88,
  "source_path": "separated_stream_a",
  "reconciled": true
}
```

### Routing Decision Schema
```json
{
  "region_id": "reg_0",
  "start": 1.25,
  "end": 3.40,
  "features": {
    "overlap_score": 0.78,
    "baseline_avg_logprob": -0.82,
    "overlap_duration": 2.15,
    "energy_ratio": 1.18
  },
  "predicted_benefit": 0.32,
  "normalized_cost": 0.15,
  "decision": "ROUTE_SEPARATION",
  "rationale": "High overlap intensity with degraded baseline confidence justifies separation cost."
}
```

---

## 4. Evaluation and Experimental Benchmarking
- **Baselines:**
  - `A: Mixture-only ASR` (Whisper direct inference on raw mixture)
  - `B: Always Separate` (ConvTasNet on all detected speech segments)
  - `C: Simple Threshold` (Separate if `overlap_score > \theta`)
  - `Proposed: Benefit-Aware Controller` (Adaptive utility optimization)
  - `Oracle Upper Bound`: Retrospective selection of optimal path per region based on ground truth WER.
- **Metrics:**
  - Speaker-Attributed Word Error Rate (SA-WER).
  - Overlap-specific WER (OV-WER).
  - P50, P90, P95 end-to-end Latency (s).
  - Separation Invocation Ratio (SIR %).
  - Normalized Compute Efficiency ($E = \Delta \text{WER} / \Delta \text{Latency}$).
