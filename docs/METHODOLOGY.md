# Routone: Mathematical Methodology & Formulations

## 1. Problem Formulation
In conversational automatic speech recognition (ASR), multi-talker overlap occurs when two or more distinct acoustic sources $s_1(t)$ and $s_2(t)$ are active concurrently over a time interval $t \in [t_{start}, t_{end}]$. The single-channel observed signal is modeled as:

$$x(t) = s_1(t) + s_2(t) + n(t)$$

where $n(t)$ denotes additive ambient background noise. Standard single-stream ASR engines (e.g. Whisper) assume a single dominant acoustic trajectory. When presented with $x(t)$, downstream recognition degrades severely: word error rate (WER) on the secondary speaker often exceeds 80%, interleaving turns are concatenated haphazardly, and phonetic tokens are masked.

---

## 2. Acoustic Overlap Detection

### A. Harmonic Clash Indicator ($C_{harm}$)
Single-speaker voiced speech is characterized by a quasi-periodic glottal pulse train with a fundamental frequency $F_0 = 1 / T_0$. Its short-time normalized autocorrelation $R_x(\tau)$ exhibits a single primary peak at lag $\tau = T_0$, followed by integer subharmonic multiples ($2T_0, 3T_0$):

$$R_x(\tau) = \frac{\sum_{n} x[n] x[n+\tau]}{\sqrt{\sum_n x^2[n] \sum_n x^2[n+\tau]}}$$

When two speakers with fundamental frequencies $F_{0,1} \neq F_{0,2}$ talk simultaneously, incommensurate periodicities produce competing secondary autocorrelation peaks at lags $\tau_1 = 1/F_{0,1}$ and $\tau_2 = 1/F_{0,2}$.

Routone identifies candidate peaks $\mathcal{P} = \{(\tau_k, R_x(\tau_k))\}$ in the human pitch search interval $\tau \in [2.5\text{ms}, 12.5\text{ms}]$ (corresponding to 80 Hz to 400 Hz). Subharmonic octave multiples satisfying:

$$\left|\frac{\max(\tau_1, \tau_2)}{\min(\tau_1, \tau_2)} - k\right| < 0.12, \quad k \in \{2, 3\}$$

are rejected as same-voice harmonics. The remaining peak ratio defines the instantaneous pitch clash index:

$$C_{harm}(t) = \text{clip}\left(\frac{R_x(\tau_2)}{R_x(\tau_1) + \epsilon} \cdot 1.25, 0.0, 1.0\right)$$

### B. Spectral Flatness & Dispersion
Overlap introduces spectral incoherence. Spectral flatness $\gamma(t)$ is computed from short-time Fourier transform (STFT) magnitudes $|X(f, t)|$:

$$\gamma(t) = \frac{\exp\left(\frac{1}{K}\sum_{k=1}^K \ln |X(f_k, t)|^2\right)}{\frac{1}{K}\sum_{k=1}^K |X(f_k, t)|^2}$$

### C. Composite Calibrated Overlap Score ($P_{ov}$)
The composite frame-level overlap indicator is given by:

$$P_{ov}(t) = \left[ 0.55 \cdot C_{harm}(t) + 0.15 \cdot \text{clip}(12 \gamma(t), 0, 1) + 0.15 \cdot \Delta \mu_{centroid}(t) + 0.15 \cdot \text{ZCR}(t) \right] \cdot \mathbb{I}_{voiced}(t)$$

To bridge intra-syllabic pauses (~200ms) without fragmenting words, morphological envelope smoothing is applied via max-pooling and uniform filtering:

$$\tilde{P}_{ov}(t) = \text{UniformFilter}_{11}\left(\text{MaxFilter}_{15}(P_{ov}(t))\right)$$

Contiguous spans where $\tilde{P}_{ov}(t) \ge \theta_{detect}$ ($\theta = 0.35$) for duration $T_{ov} \ge 0.30$s are grouped into overlap candidate regions $\mathcal{R}_i = [t_i^{start}, t_i^{end}]$.

---

## 3. Time-Domain Speech Separation & Overlap-Add

For each region routed to separation, audio is extracted with symmetric 100ms padding. Separation is performed using PyTorch Torchaudio's pretrained Conv-TasNet bundle (`CONVTASNET_BASE_LIBRI2MIX`).

Because Conv-TasNet operates natively at 8,000 Hz, polyphase sinc resampling converts:

$$x_{16k}(t) \xrightarrow{\text{Resample}(16k \to 8k)} x_{8k}(t) \xrightarrow{\text{ConvTasNet}} \{\hat{s}_{A, 8k}(t), \hat{s}_{B, 8k}(t)\} \xrightarrow{\text{Resample}(8k \to 16k)} \{\hat{s}_{A, 16k}(t), \hat{s}_{B, 16k}(t)\}$$

### Chunked Windowed Overlap-Add with Permutation Tracking
For regions longer than 4.0 seconds, processing is windowed with 2.0s hop lengths. To prevent speaker swap across chunk boundaries, cross-stream correlation between chunk $m$ and chunk $m-1$ is evaluated across the overlap window:

$$\mathcal{C}_{direct} = \langle \hat{s}_{A}^{(m-1)}, \hat{s}_{A}^{(m)} \rangle + \langle \hat{s}_{B}^{(m-1)}, \hat{s}_{B}^{(m)} \rangle$$
$$\mathcal{C}_{swap} = \langle \hat{s}_{A}^{(m-1)}, \hat{s}_{B}^{(m)} \rangle + \langle \hat{s}_{B}^{(m-1)}, \hat{s}_{A}^{(m)} \rangle$$

If $\mathcal{C}_{swap} > \mathcal{C}_{direct}$, output channels are swapped before Hann-window crossfading.

---

## 4. Benefit-Aware Adaptive Routing Controller

### The Utility Objective Function
Let $R_i$ be an overlap candidate region. The controller evaluates the net expected utility $U(R_i)$ of invoking separation:

$$U(R_i) = \mathbb{E}[\Delta \text{Accuracy}(R_i)] - \lambda \cdot \text{Cost}(R_i)$$

where:
- $\mathbb{E}[\Delta \text{Accuracy}(R_i)] \in [0.0, 1.0]$ is the predicted reduction in Word Error Rate (WER) achieved by separating the overlapping streams versus retaining the mixture baseline.
- $\text{Cost}(R_i) = \frac{\tau_{sep}(R_i) + 2 \cdot \tau_{asr}(R_i)}{\tau_{max}}$ is the normalized computational latency overhead.
- $\lambda \ge 0$ is the user-configurable latency penalty coefficient.

### Benefit Prediction Model
The benefit model estimates the value of separation as a function of acoustic overlap intensity and baseline ASR uncertainty:

$$\text{logit}(R_i) = \beta_0 + \beta_1 P_{ov} + \beta_2 C_{harm} + \beta_3 \mathcal{U}_{baseline} + \beta_4 T_{ov}$$

where baseline recognition uncertainty is extracted directly from Whisper's average token log-probability:

$$\mathcal{U}_{baseline} = \text{clip}(-\overline{\log p}_{base} - 0.40, 0.0, 3.0)$$

The predicted benefit is given by the sigmoid function:

$$\mathbb{E}[\Delta \text{Accuracy}] = \sigma(\text{logit}(R_i)) = \frac{1}{1 + e^{-\text{logit}(R_i)}}$$

### Decision Rule
$$\text{Decision}(R_i) = \begin{cases}
\text{FLAG\_REVIEW}, & \text{if } \hat{K} \ge 3 \text{ (exceeds 2-speaker model capacity)} \\
\text{ROUTE\_SEPARATION}, & \text{if } U(R_i) > 0.05 \\
\text{KEEP\_MIXTURE}, & \text{if } U(R_i) \le 0.05
\end{cases}$$

---

## 5. Candidate Hypothesis Reconciliation
To produce a single, unified, speaker-attributed transcript without hallucinations:

1. **Non-overlapping spans:** Preserved directly from the baseline mixture pass.
2. **Separated streams transcription:**
   $$\hat{s}_A(t) \xrightarrow{\text{ASR}} \mathcal{T}_A = \{w_{A, j}\}, \quad \hat{s}_B(t) \xrightarrow{\text{ASR}} \mathcal{T}_B = \{w_{B, k}\}$$
3. **De-duplication of acoustic leakage:**
   If acoustic bleed causes both Stream A and Stream B to recognize the same utterance within $\Delta t < 0.3$s, the hypothesis with lower average logprob is suppressed:
   $$\text{Keep } \arg\max_{S \in \{A, B\}} \overline{\log p}(S)$$
4. **Anti-hallucination filter:**
   Degenerate token repetition loops ($\ge 40\%$ single-token frequency or $\ge 3$ repeated bigrams) are pruned.
5. **Fallback mechanism:**
   If separation on a routed region produces silence or rejected hallucinations, the pipeline restores the baseline mixture hypothesis for that window.
