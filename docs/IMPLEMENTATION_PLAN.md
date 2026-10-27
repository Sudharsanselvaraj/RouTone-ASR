# OverlapWeave: Implementation Plan

## 1. Project Overview & Scope
OverlapWeave investigates benefit-aware adaptive speech separation for speaker-attributed Automatic Speech Recognition (ASR) in overlapping multilingual (Tamil–English code-switching) conversations.

The objective is to avoid both failure modes of existing systems:
1. **Mixture-Only ASR:** Loses secondary speaker utterances, scrambles interleaving turns, and exhibits high error rates on overlapped spans.
2. **Always-Separate ASR:** Incurs massive computational latency (5–10× overhead), degrades audio on clean single-speaker regions due to separation artifacts, and wastes inference energy.
3. **Naive Overlap-Thresholding:** Triggers separation on every detected acoustic overlap, even if the primary speaker was already recognized with high confidence or the overlapped utterance is unrecoverable noise.

OverlapWeave develops a **region-level adaptive controller** optimizing:
$$\text{Utility} = \mathbb{E}[\Delta \text{Accuracy}] - \lambda \cdot \text{Normalized Additional Cost}$$

---

## 2. Milestones & Work Breakdown Structure

### Milestone 1: Development Environment, Repository Architecture & Baseline ASR
- [x] Audit system environment (Python 3.11, PyTorch 2.x, FFmpeg, Node/Vite).
- [x] Configure virtual environment `.venv` with `faster-whisper`, `torchaudio`, `soundfile`, `librosa`, `scikit-learn`, `fastapi`, `uvicorn`, `jiwer`.
- [x] Establish package structure under `src/overlapweave/`.
- [ ] Implement robust audio ingestion engine (`overlapweave.audio.processor`): format conversion, resampling to 16kHz, duration and channel normalization, waveform statistics.
- [ ] Implement Baseline ASR engine (`overlapweave.asr.whisper_engine`): `faster-whisper` integration, word/segment timestamp extraction, language identification (en/ta), log-probability tracking.
- [ ] Implement REST API routes for ingestion, baseline transcription, and health check.
- [ ] Unit & integration tests for audio validation and baseline ASR.

### Milestone 2: Overlap Detection & Speech Separation Pipeline
- [ ] Implement acoustic overlap detector (`overlapweave.overlap.detector`): short-window energy fluctuation, zero-crossing rate variance, harmonic pitch collision analysis, and multi-speaker likelihood scoring.
- [ ] Implement speech separation adapter (`overlapweave.separation.separator`):
  - Pretrained `ConvTasNet` (from `torchaudio.pipelines.CONVTASNET_BASE_LIBRI2MIX` or asteroid/speechbrain).
  - Windowed chunk processing with smooth cosine overlap-add crossfade reconstruction.
  - Graceful fallback for non-separable segments or out-of-memory constraints.
- [ ] Unit tests for overlap boundaries, separation adapter IO, and stream mapping.

### Milestone 3: Speaker-Attributed ASR, Alignment & Reconciliation
- [ ] Implement multi-stream ASR (`overlapweave.alignment.speaker_matcher`): transcribing separated channels $S_A$ and $S_B$.
- [ ] Implement Candidate Reconciliation Engine (`overlapweave.reconciliation.reconciler`):
  - Merge baseline and separated candidate hypotheses.
  - Alignment via time-interval overlap and acoustic confidence.
  - Preservation of Tamil script, English Latin words, and phonetic code-switch tokens.
  - Rejection of separation hallucinations.
- [ ] Unit tests for alignment and reconciliation contracts.

### Milestone 4: Adaptive Benefit-Aware Separation Controller
- [ ] Implement Feature Extractor (`overlapweave.routing.features`):
  - Overlap duration ($T_{ov}$).
  - Overlap score ($P_{ov}$).
  - Baseline ASR confidence / token log-prob in overlap region.
  - Speaker energy ratio (dB imbalance).
  - Estimated separation latency.
- [ ] Implement Controllers (`overlapweave.routing.controller`):
  - Baseline C: Fixed threshold ($\theta$).
  - Proposed Benefit-Aware Controller: Calibrated utility-maximizer predicting $\Delta \text{WER}$ and factoring compute cost $\lambda$.
  - Oracle Upper Bound: Diagnostic optimal path selector.
- [ ] Safeguards against test-split and speaker leakage.

### Milestone 5: Evaluation Harness & Benchmark Suite
- [ ] Synthetic overlap generator (`overlapweave.evaluation.synthetic_generator`): creates controlled Tamil–English conversational overlaps with known reference transcripts and isolated ground-truth stems.
- [ ] Metric computation suite (`overlapweave.evaluation.metrics`):
  - Speaker-Attributed Word Error Rate (SA-WER).
  - Overlap-specific WER (OV-WER).
  - Per-speaker word recall.
  - Latency percentiles (P50, P90, P95).
  - Separation Invocation Rate (SIR).
- [ ] Benchmark runner comparing Baselines A, B, C, Proposed Controller, and Oracle.

### Milestone 6: Full-Stack Web Interface (ASR Studio & Research Lab)
- [ ] Initialize Vite + React + TypeScript web application in `apps/web/`.
- [ ] Visual design system: Restrained dark theme (charcoal `#0d1117`, deep navy `#161b22`, cyan/teal `#38bdf8` / `#2dd4bf` accents).
- [ ] Page 1: **ASR Studio** (drag-and-drop audio, mic recording, waveform player, live transcription, export TXT/SRT/VTT/JSON).
- [ ] Page 2: **Overlap Inspector** (multi-track waveform, overlap timeline, separated streams audio inspection, word-to-audio seek).
- [ ] Page 3: **Adaptive Routing Lab** (candidate overlap regions, extracted feature table, controller routing decisions, utility breakdown).
- [ ] Page 4: **Benchmarks & Analytics** (comparative metric cards, accuracy vs latency Pareto curve, downloadable results).

### Milestone 7: Testing, Documentation & Packaging
- [ ] Complete automated test suite covering units, integration, schemas, and metrics.
- [ ] Complete `docs/ARCHITECTURE.md`, `docs/RELATED_WORK.md`, `docs/METHODOLOGY.md`, `docs/EXPERIMENTS.md`, `docs/LIMITATIONS.md`, `docs/DATA_AND_MODEL_LICENSES.md`.
- [ ] Complete `README.md` with clear installation and reproducible execution steps.
