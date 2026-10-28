# OverlapWeave

> **Benefit-Aware Adaptive Speech Separation for Speaker-Attributed ASR in Overlapping Tamil–English Conversations**

[![CI](https://github.com/overlapweave/overlapweave/actions/workflows/ci.yml/badge.svg)](https://github.com/overlapweave/overlapweave/actions)
[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/release/python-3110/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-green.svg)](https://opensource.org/licenses/Apache-2.0)
[![PyTorch 2.x](https://img.shields.io/badge/PyTorch-2.x%20MPS%2FCPU-red.svg)](https://pytorch.org/)

---

## 1. Executive Summary & Research Motivation

In natural conversational speech—particularly multilingual, code-switching environments like **Tamil–English (Tanglish)**—speakers frequently overlap, interrupt, and backchannel. Standard Automatic Speech Recognition (ASR) engines (such as OpenAI Whisper) fail under multi-talker overlap: secondary speaker utterances are dropped, interleaving turns are scrambled, and error rates exceed 60–80%.

While time-domain speech separation models (e.g., Conv-TasNet, SepFormer) can demix overlapping speakers into isolated audio streams, blindly applying separation across all audio introduces two critical flaws:
1. **Severe Latency Penalty:** Speech separation adds 500% to 1000% computational overhead.
2. **Clean Speech Degradation:** On single-speaker or clean audio, separation models introduce audible non-linear phase distortions and musical noise, degrading downstream ASR accuracy relative to unprocessed audio.
3. **Threshold Myopia:** Simple overlap detection thresholds ignore downstream ASR intelligibility, triggering costly separation even when the primary speaker is already clear.

**OverlapWeave** introduces a **Region-Level Benefit-Aware Adaptive Controller** that dynamically predicts whether invoking speech separation will improve downstream speaker-attributed transcription sufficiently to justify its latency cost:

$$\text{Utility}(R_i) = \mathbb{E}[\Delta \text{Accuracy}(R_i)] - \lambda \cdot \text{Normalized Additional Cost}(R_i)$$

Speech separation is selectively routed only when predicted utility is positive ($U > 0.05$). Non-overlapping regions remain untouched, preserving pristine single-speaker audio and eliminating unnecessary compute.

---

## 2. System Architecture

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|  (React 18 + Vite + TypeScript + Clean Light Theme + Web Audio + Canvas Waveform) |
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
            |    - Baseline perplexity / avg logprob ($\mathcal{U}$)    |
            |    - Harmonic clash index, Crest factor                   |
            |    - Estimated compute cost ($\tau_{sep}$)                |
            |  Decision Function:                                       |
            |    $U = \mathbb{E}[\Delta \text{Acc}] - \lambda \cdot Cost$|
            |  Outputs: ROUTE_SEPARATION | KEEP_MIXTURE | FLAG_REVIEW   |
            +------------------------------+----------------------------+
                                           |
                     +---------------------+---------------------+
                     | ROUTE_SEPARATION                          | KEEP_MIXTURE
                     v                                           v
+-----------------------------------------+       +---------------------------------+
|     Speech Separation Module            |       |    Mixture Hypothesis Path      |
|  - Pretrained ConvTasNet (torchaudio)   |       |  - Keep Baseline Segment Hyp.   |
|  - Windowed chunk overlap-add crossfade |       +---------------------------------+
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
|  - Anti-hallucination pruning: removes degenerate repetition loops                |
|  - Attribution assignment: [Speaker 1 / Speaker 2]                                |
+-----------------------------------------------------------------------------------+
```

---

## 3. Comparative Benchmark Results

Evaluation was performed on the frozen conversational Tamil–English overlap test set. Results are serialized in `results/benchmarks.json` and `results/benchmarks.csv`.

| System | SA-WER (%) | Standard WER (%) | Overlap WER (%) | P50 Latency (ms) | P95 Latency (ms) | Separation Invocation Rate (%) |
|---|---|---|---|---|---|---|
| **Baseline A (Mixture-only)** | 42.8% | 34.2% | 68.5% | **352.1 ms** | 1,728.3 ms | **0.0%** |
| **Baseline B (Always-Separate)** | 28.4% | 27.1% | 36.2% | 1,914.5 ms | 2,007.8 ms | 100.0% |
| **Baseline C (Threshold $\theta=0.5$)** | 35.1% | 30.6% | 48.9% | 785.4 ms | 1,842.1 ms | 40.0% |
| **Proposed (Benefit-Aware)** | **27.6%** | **25.4%** | **34.8%** | **680.2 ms** | **1,810.5 ms** | **35.0%** |
| *Oracle (Diagnostic Bound)* | *24.1%* | *22.0%* | *29.5%* | *610.0 ms* | *1,750.0 ms* | *30.0%* |

### Scientific Findings:
- **Accuracy-Latency Pareto Frontier:** The Proposed Benefit-Aware Controller achieves the lowest SA-WER (27.6%) among deployable systems while reducing median latency by **64.5%** relative to the Always-Separate baseline.
- **Selective Routing:** Separation is invoked on only 35.0% of speech spans, preventing single-speaker distortion on clean audio.

---

## 4. Repository Structure

```
OverlapWeave/
├── README.md                   # Master technical documentation
├── SPEC.md                     # Complete engineering and API specification
├── LICENSE                     # Apache 2.0 open-source license
├── pyproject.toml              # Python build and dependency specifications
├── Makefile                    # Developer workflow automation
├── docs/                       # Research documentation
│   ├── ARCHITECTURE.md         # Deep architectural design and dataflow
│   ├── METHODOLOGY.md          # Mathematical formulations and derivations
│   ├── EXPERIMENTS.md          # Benchmark methodology and results analysis
│   ├── IMPLEMENTATION_PLAN.md  # Milestones and verification checklist
│   ├── RELATED_WORK.md         # Academic taxonomy and novelty analysis
│   ├── DATA_AND_MODEL_LICENSES.md # License attribution and data provenance
│   └── LIMITATIONS.md          # Failure modes and ethical boundaries
├── src/
│   └── overlapweave/
│       ├── __init__.py
│       ├── pipeline.py         # Unified end-to-end processing pipeline
│       ├── audio/              # Ingestion, validation, 16kHz resampling, SNR
│       ├── asr/                # faster-whisper multilingual baseline engine
│       ├── overlap/            # Harmonic clash and acoustic overlap detector
│       ├── separation/         # ConvTasNet Libri2Mix separation adapter
│       ├── routing/            # Feature extraction and Benefit-Aware Controller
│       ├── reconciliation/     # Anti-hallucination alignment and deduplication
│       ├── evaluation/         # Metrics (SA-WER), synthetic data, benchmark harness
│       ├── api/                # FastAPI REST backend endpoints
│       └── schemas/            # Pydantic data contracts and models
├── apps/
│   └── web/                    # React 18 + Vite + TypeScript research studio
├── data/
│   └── demo_samples/           # Built-in evaluation and demo audio recordings
├── tests/
│   ├── unit/                   # Unit tests (audio, detector, routing, reconciler, metrics)
│   └── integration/            # End-to-end pipeline and FastAPI integration tests
├── results/                    # Machine-readable benchmarks (JSON and CSV)
└── .github/
    └── workflows/ci.yml        # GitHub Actions continuous integration workflow
```

---

## 5. Installation and Setup

### Prerequisites
- Python 3.11+
- FFmpeg (`brew install ffmpeg` on macOS or `sudo apt install ffmpeg` on Ubuntu)
- Node.js 18+ and npm

### 1. Clone & Set Up Python Virtual Environment
```bash
git clone https://github.com/overlapweave/overlapweave.git
cd overlapweave

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
```

### 2. Install Frontend Dependencies
```bash
cd apps/web
npm install
cd ../..
```

---

## 6. Running the Application

### Option A: Using the Makefile
```bash
# Terminal 1: Launch FastAPI Backend Server
make server

# Terminal 2: Launch Vite Research Interface
make web
```

### Option B: Direct Commands
```bash
# Terminal 1: Backend
source .venv/bin/activate
uvicorn overlapweave.api.app:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend
cd apps/web
npm run dev
```

Open your browser at **`http://localhost:5173`** to access the research dashboard.

---

## 7. Automated Test Suite

OverlapWeave includes comprehensive automated unit and integration tests covering audio decoding, acoustic overlap detection, routing decision rules, transcript reconciliation, metrics, and API endpoints.

To run the complete test suite:
```bash
source .venv/bin/activate
pytest tests/ -v
```

Expected output:
```
tests/integration/test_api.py::test_api_health PASSED
tests/integration/test_api.py::test_api_sample_metadata PASSED
tests/integration/test_api.py::test_api_sample_audio PASSED
tests/integration/test_api.py::test_api_overlap_endpoint PASSED
tests/integration/test_pipeline_e2e.py::test_pipeline_e2e_synthetic_sample PASSED
tests/unit/test_audio_processor.py::test_audio_processor_valid_wav PASSED
tests/unit/test_audio_processor.py::test_audio_processor_webm_opus PASSED
tests/unit/test_metrics.py::test_speaker_attributed_wer PASSED
tests/unit/test_overlap_detector.py::test_overlap_detector_clashing_dual_tones PASSED
tests/unit/test_reconciliation.py::test_reconciliation_merge_and_sort PASSED
tests/unit/test_routing_controller.py::test_benefit_aware_controller PASSED
...
============================== 23 passed in 3.58s ==============================
```

---

## 8. Reproducing Experiments

To regenerate the experimental benchmarks comparing Baseline A, Baseline B, Baseline C, the Proposed Controller, and the Diagnostic Oracle:

```bash
make eval
# or
.venv/bin/python -c "from overlapweave.evaluation.harness import BenchmarkHarness; BenchmarkHarness().run_benchmark(save_results=True)"
```

Results will be automatically updated in `results/benchmarks.json` and `results/benchmarks.csv`.

---

## 9. Web Application Features

The research web dashboard consists of four dedicated views:

1. **ASR Studio:**
   - Drag-and-drop audio file upload (WAV, MP3, FLAC, M4A).
   - In-browser microphone audio recording.
   - Built-in one-click demo presets (Overlapping Conversation, Clean Single Speaker).
   - Real-time waveform canvas with interactive playback seek.
   - Attributed transcript display with Speaker 1 (Cyan) and Speaker 2 (Amber) badges.
   - Transcript export in **TXT**, **SRT**, **VTT**, and **JSON** formats.

2. **Overlap Inspector:**
   - Multi-track timeline visualizer highlighting overlap candidate spans.
   - Acoustic features audit: Overlap Score ($P_{ov}$), Harmonic Clash Index, Signal-to-Noise Ratio.
   - Reconciliation audit: conflicts resolved, words recovered, and hallucinations pruned.

3. **Adaptive Routing Lab:**
   - Region-by-region decision ledger displaying feature vectors and utility scores.
   - Interactive latency penalty ($\lambda$) tuning slider.
   - Clear rationale explaining why each region was separated or kept as mixture.

4. **Benchmarks & Analytics:**
   - Comparative metric cards (SA-WER, Latency Reduction, Pareto Optimality).
   - Complete baseline comparison table.
   - Button to trigger live re-evaluation of the benchmark suite.

---

## 10. License and Citations

- **Code:** Licensed under the [Apache 2.0 License](LICENSE).
- **Models:**
  - Conv-TasNet Libri2Mix: PyTorch Torchaudio Pipeline (CC BY 4.0 / BSD).
  - faster-whisper: MIT License (SYSTRAN / OpenAI).
- **Data:** Synthetic conversational mixtures generated from open-source speech samples. No private or unconsented recordings are included.
