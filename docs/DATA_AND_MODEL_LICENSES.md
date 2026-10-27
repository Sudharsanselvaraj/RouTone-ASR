# Data, Model, and Software Licenses

## 1. Software Components & Open-Source Licenses

| Component | Repository / Provider | License | Purpose in OverlapWeave |
|---|---|---|---|
| **PyTorch & Torchaudio** | PyTorch Foundation | Modified BSD | Deep learning runtime & audio tensor operations |
| **Conv-TasNet Libri2Mix** | torchaudio pipeline / Libri2Mix | CC BY 4.0 / BSD | Pretrained 2-source speech separation bundle |
| **faster-whisper** | SYSTRAN / OpenAI Whisper | MIT License | CTranslate2-accelerated multilingual ASR |
| **CTranslate2** | OpenNMT / SYSTRAN | MIT License | Fast transformer inference engine (C++/Python) |
| **Librosa & Soundfile** | Librosa / Soundfile team | ISC / BSD-3-Clause | Audio signal processing, STFT, file IO |
| **FastAPI & Uvicorn** | Sebastián Ramírez & Encode | MIT License | High-performance asynchronous REST API |
| **jiwer** | Nik Vaessen | Apache 2.0 | Standard Word Error Rate (WER) computation |
| **scikit-learn** | scikit-learn developers | BSD-3-Clause | Controller feature scaling & regression |
| **React & Vite** | Facebook / Evan You & Vite Contributors | MIT License | Modern single-page research interface |

---

## 2. Model Weights & Checkpoint Attribution

1. **Torchaudio Conv-TasNet (`CONVTASNET_BASE_LIBRI2MIX`)**:
   - Architecture: Conv-TasNet (Luo & Mesgarani, 2019)
   - Training Data: Libri2Mix clean 2-speaker speech mixture dataset
   - Sampling Rate: 8 kHz internal, handled via high-fidelity resamplers to 16 kHz
   - Checkpoint: Provided natively by PyTorch Torchaudio distribution under permissive licensing.

2. **OpenAI Whisper (`tiny`, `base`, `small`) via faster-whisper**:
   - Checkpoint: Converted from OpenAI's open-weights release
   - Language Support: 99 languages including Tamil (`ta`) and English (`en`)
   - Permissive use permitted under MIT license.

---

## 3. Data Provenance & Ethics
- **Synthetic Mixture Construction:** OverlapWeave utilizes synthetic controlled mixtures generated from licensed open datasets (e.g. LibriSpeech under CC BY 4.0 and open Tamil speech samples) where isolated source stems are known.
- **Privacy & PII:** No private recordings, unconsented conversational intercepts, or proprietary commercial datasets are bundled with this repository.
- **Fair Use:** All evaluations conducted comply with academic research guidelines and reproducibility standards.
