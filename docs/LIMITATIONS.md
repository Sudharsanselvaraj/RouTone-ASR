# Limitations and Failure Analysis

## 1. Known Architectural Limitations

### A. Number of Concurrent Speakers ($K=2$)
- **Constraint:** The speech separation component (`CONVTASNET_BASE_LIBRI2MIX`) is trained for 2-speaker mixture separation.
- **Limitation:** In multi-party conferences where 3 or more speakers overlap simultaneously, the model clusters excess speakers into the 2 output streams or produces acoustic distortion.
- **Mitigation:** The overlap detector estimates speaker count ($K$); regions with $\hat{K} \ge 3$ can be flagged for human review (`FLAG_REVIEW`) rather than misrouting to 2-stream separation.

### B. Sample Rate Conversion (8 kHz $\leftrightarrow$ 16 kHz)
- **Constraint:** The Libri2Mix ConvTasNet operates natively on 8 kHz sampled audio, whereas Whisper ASR operates on 16 kHz audio.
- **Limitation:** Downsampling to 8 kHz removes frequencies above 4 kHz, slightly attenuating high-frequency fricatives before upsampling back to 16 kHz for Whisper.
- **Mitigation:** High-quality polyphase sinc filtering (`torchaudio.transforms.Resample`) minimizes aliasing and phase distortion.

### C. Permutation Invariance & Cross-Chunk Speaker Consistency
- **Constraint:** In multi-window separation, independent chunk processing can experience permutation swap (where Speaker 1 is assigned to Output A in chunk 1, but Output B in chunk 2).
- **Mitigation:** OverlapWeave implements cross-stream correlation matching across windowed cross-fades and acoustic embedding continuity to align speaker tracks consistently.

---

## 2. Code-Switching (Tamil–English) Challenges
- **Phonetic Assimilation:** Fast conversational Tamil mixed with English loanwords often causes standard Whisper models to hallucinate either purely English or purely Tamil spellings.
- **Script Discrepancy:** Ground truth can be written in Tamil script (e.g., "வணக்கம்"), Latin transliteration ("vanakkam"), or English ("hello"). The reconciliation engine normalizes script representations where appropriate and prevents duplicate token insertions.

---

## 3. Hardware & Compute Constraints
- **Apple Silicon & CPU:** Execution on Apple Silicon (M-series) uses PyTorch MPS or high-performance CPU with int8 quantization.
- **Latency Trade-Off:** While ConvTasNet inference is fast, doing two Whisper passes (for Stream A and Stream B) on separated audio increases transcription time. The Benefit-Aware Controller is specifically designed to eliminate this cost on 60–80% of audio regions where separation is unneeded.
