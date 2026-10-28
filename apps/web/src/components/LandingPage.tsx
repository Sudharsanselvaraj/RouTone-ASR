import { useState } from 'react';
import {
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (tab: 'studio' | 'inspector' | 'routing' | 'benchmarks', preset?: 'overlap' | 'clean' | 'cs') => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);

  const workflows = [
    {
      id: 'overlap',
      label: 'Real-time Multi-pitch Overlap Detection',
      tag: 'Acoustic Front-end',
      desc: 'Harmonic clash index (C_harm), subharmonic octave suppression (2x, 3x F0), and crest factor analysis track fundamental frequencies to pinpoint concurrent speaker collisions.',
      taskPrompt: 'prep Tamil-English conversation [eval_te_01.wav]',
      steps: [
        { label: 'Ingest 16 kHz mono dual-talker waveform', status: 'done', detail: 'Sample duration: 5.20s · SNR: 38.2 dB' },
        { label: 'Compute STFT spectrogram & multi-pitch peaks', status: 'done', detail: 'F0_A: 130 Hz (Male) · F0_B: 220 Hz (Female)' },
        { label: 'Detect harmonic clash region: [01.20s – 03.20s]', status: 'active', detail: 'Harmonic clash index = 0.74 > threshold' },
        { label: 'Tag overlap span for controller evaluation', status: 'pending', detail: 'Duration: 2.00s candidate window' },
      ],
    },
    {
      id: 'routing',
      label: 'Benefit-Aware Separation Routing',
      tag: 'Dynamic Controller',
      desc: 'Evaluates expected downstream ASR gain against normalized compute cost: U = E[ΔAcc] - λ·Cost. Automatically keeps single-speaker audio untouched and routes only degraded collisions.',
      taskPrompt: 'evaluate routing utility [region_01: 01.20s - 03.20s]',
      steps: [
        { label: 'Extract region features (duration, clash, baseline logprob)', status: 'done', detail: 'C_harm: 0.74 · Avg logprob: -1.28' },
        { label: 'Estimate downstream accuracy benefit E[ΔAcc]', status: 'done', detail: 'Expected word error reduction: +54%' },
        { label: 'Compute normalized ConvTasNet penalty (λ = 0.45)', status: 'done', detail: 'Cost penalty: 0.16 utility units' },
        { label: 'Calculate Net Utility: U = +0.38 > 0 → ROUTE_SEPARATION', status: 'active', detail: 'Separation justified: demixing scheduled' },
      ],
    },
    {
      id: 'separation',
      label: 'Cross-Talk Acoustic Demixing (ConvTasNet)',
      tag: 'PyTorch MPS Engine',
      desc: 'Isolates mixed voices into discrete acoustic streams using ConvTasNet Libri2Mix with cross-fade overlap-add to eliminate boundary phase discontinuities.',
      taskPrompt: 'demix collision slice [01.20s - 03.20s]',
      steps: [
        { label: 'Extract audio slice with 100ms context padding', status: 'done', detail: 'Slice length: 35,200 samples' },
        { label: 'Execute 1D Conv-TasNet separation forward pass', status: 'done', detail: 'Latency: 142ms on Apple Silicon MPS' },
        { label: 'Synthesize Stream 1 (Primary) and Stream 2 (Secondary)', status: 'active', detail: 'Estimated SI-SDR improvement: +9.4 dB' },
        { label: 'Apply Hanning cross-fade taper to mixture boundaries', status: 'pending', detail: 'Zero audible boundary click artifacts' },
      ],
    },
    {
      id: 'reconciliation',
      label: 'Speaker-Attributed Transcript Reconciliation',
      tag: 'Multilingual Alignment',
      desc: 'Aligns word-level timestamps across separated streams and baseline hypothesis, pruning acoustic leakage repetitions and resolving Tamil-English code-switches.',
      taskPrompt: 'reconcile candidate hypotheses [faster-whisper]',
      steps: [
        { label: 'Transcribe Stream 1 & Stream 2 with word timestamps', status: 'done', detail: 'faster-whisper int8 · Multilingual ta/en' },
        { label: 'Deduplicate acoustic leakage cross-talk tokens', status: 'done', detail: 'Filtered 2 phantom echo tokens' },
        { label: 'Prune repetitive hallucination loops', status: 'done', detail: 'Confidence gating: 0 hallucinated loops' },
        { label: 'Synthesize final attributed dialogue with timestamps', status: 'active', detail: 'Attributed 100% tokens to Spk1 / Spk2' },
      ],
    },
  ];

  const currentWorkflow = workflows[activeWorkflowIndex];

  return (
    <div className="parley-landing">
      {/* 1. TOP NAVIGATION BAR */}
      <header className="parley-nav">
        <div className="parley-nav-container">
          <div className="parley-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="parley-logo-mark">
              <span className="parley-logo-icon">OW</span>
            </div>
            <span className="parley-logo-text">OverlapWeave</span>
          </div>

          <nav className="parley-nav-links">
            <a href="#why-weave">Why Weave</a>
            <a href="#workflow">Workflow</a>
            <a href="#integrations">Integrations</a>
            <button onClick={() => onNavigate('benchmarks')} className="parley-nav-link-btn">
              Benchmarks
            </button>
            <button onClick={() => onNavigate('inspector')} className="parley-nav-link-btn">
              Inspector
            </button>
            <button onClick={() => onNavigate('routing')} className="parley-nav-link-btn">
              Routing Lab
            </button>
          </nav>

          <div className="parley-nav-actions">
            <button
              onClick={() => onNavigate('studio')}
              className="parley-btn"
              title="Open ASR Studio"
            >
              <span className="parley-btn-icon">
                <ChevronRight size={16} strokeWidth={2.5} />
              </span>
              <span className="parley-btn-label">Launch Studio</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="parley-hero-section">
        <div className="parley-hero-card">
          <div className="parley-hero-overlay"></div>
          
          <div className="parley-hero-content">
            <div className="parley-hero-badge">
              <span className="parley-hero-badge-dot"></span>
              Research & Evaluation Platform · Multilingual ASR
            </div>

            <h1 className="parley-hero-title">
              The speech system that listens <br />
              <span className="parley-serif-italic">through overlap</span>, not just past it
            </h1>

            <p className="parley-hero-subtitle">
              OverlapWeave dynamically routes speech separation only when acoustic overlap degrades transcription —
              delivering pristine speaker-attributed ASR in Tamil and English without compute overhead.
            </p>

            <div className="parley-hero-cta-group">
              <button
                onClick={() => onNavigate('studio', 'overlap')}
                className="parley-btn parley-btn-large"
              >
                <span className="parley-btn-icon">
                  <ChevronRight size={18} strokeWidth={2.5} />
                </span>
                <span className="parley-btn-label">Get started free</span>
              </button>

              <button
                onClick={() => onNavigate('benchmarks')}
                className="parley-secondary-btn"
              >
                <span>Explore Benchmarks</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* TRUSTED BY / PARTNERS BAR */}
        <div className="parley-partners-bar">
          <p className="parley-partners-label">Evaluated on Tamil–English Conversational Benchmarks · Powered by Open Research</p>
          <div className="parley-partners-grid">
            <div className="parley-partner-item">
              <span className="partner-name">PyTorch</span>
            </div>
            <div className="parley-partner-item">
              <span className="partner-name">faster-whisper</span>
            </div>
            <div className="parley-partner-item">
              <span className="partner-name">Torchaudio</span>
            </div>
            <div className="parley-partner-item">
              <span className="partner-name">FastAPI</span>
            </div>
            <div className="parley-partner-item">
              <span className="partner-name">Hugging Face</span>
            </div>
            <div className="parley-partner-item">
              <span className="partner-name">React 19</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. WHY OVERLAPWEAVE SECTION */}
      <section id="why-weave" className="parley-section">
        <div className="parley-section-header">
          <div>
            <span className="parley-eyebrow">Why OverlapWeave</span>
            <h2 className="parley-section-title">
              A selective partner, <br />
              <span className="parley-serif-italic">not brute-force separation</span>
            </h2>
          </div>
          <p className="parley-section-lead">
            Most multi-talker speech systems either ignore overlapping talkers entirely or apply costly separation to every second.
            OverlapWeave calculates the exact recognition gain before invoking separation — anticipating degradation, executing Conv-TasNet demixing, and preserving single-speaker clarity.
          </p>
        </div>

        <div className="parley-cards-grid">
          {/* Card 1: Elevated card with speech bubble preview */}
          <div className="parley-card parley-card-highlight">
            <div className="parley-card-preview-box">
              <div className="parley-chat-bubble">
                <div className="parley-bubble-icon">
                  <Sparkles size={14} className="text-amber-600" />
                </div>
                <div className="parley-bubble-text">
                  <span className="bubble-time">[01:12 – 03:40]</span> Dual-speaker clash detected. Utility U = +0.42 → <strong>ROUTE_SEPARATION</strong>
                </div>
              </div>
            </div>
            <div className="parley-card-body">
              <h3 className="parley-card-title">Always benefit-aware</h3>
              <p className="parley-card-desc">
                Calculates net utility U = E[ΔAcc] - λ·Cost. Invokes Conv-TasNet only when predicted ASR gain exceeds the latency penalty, avoiding the 5.8× compute overhead of always-separate.
              </p>
            </div>
          </div>

          {/* Card 2: Multi-pitch Overlap */}
          <div className="parley-card">
            <div className="parley-card-graphic">
              <span className="parley-card-watermark">02.</span>
              <div className="parley-blocks-art">
                <div className="block b-1"></div>
                <div className="block b-2"></div>
                <div className="block b-3"></div>
                <div className="block b-4"></div>
                <div className="block b-5"></div>
                <div className="block b-6"></div>
              </div>
            </div>
            <div className="parley-card-body">
              <h3 className="parley-card-title">Takes real action</h3>
              <p className="parley-card-desc">
                Beyond standard energy VAD, multi-pitch harmonic clash analysis (C_harm) with subharmonic suppression identifies concurrent voiced speakers and isolates conflict zones without hallucinating.
              </p>
            </div>
          </div>

          {/* Card 3: Bilingual Tamil-English */}
          <div className="parley-card">
            <div className="parley-card-graphic">
              <span className="parley-card-watermark">03.</span>
              <div className="parley-nodes-art">
                <div className="node n-1"></div>
                <div className="node n-2"></div>
                <div className="node n-3"></div>
                <div className="node n-4"></div>
                <div className="node n-5"></div>
              </div>
            </div>
            <div className="parley-card-body">
              <h3 className="parley-card-title">Connects everything</h3>
              <p className="parley-card-desc">
                Engineered specifically for natural multilingual turn-taking, backchanneling, and intra-sentential Tanglish code-switching with word-level acoustic alignment.
              </p>
            </div>
          </div>

          {/* Card 4: Speaker-Attributed Reconciliation */}
          <div className="parley-card">
            <div className="parley-card-graphic">
              <span className="parley-card-watermark">04.</span>
              <div className="parley-scatter-art">
                <div className="dot d-1"></div>
                <div className="dot d-2"></div>
                <div className="dot d-3"></div>
                <div className="dot d-4"></div>
                <div className="dot d-5"></div>
                <div className="dot d-6"></div>
              </div>
            </div>
            <div className="parley-card-body">
              <h3 className="parley-card-title">Gets better over time</h3>
              <p className="parley-card-desc">
                Acoustic stream leakage deduplication, anti-hallucination pruning, and temporal reconciliation assign every word to Speaker 1 or Speaker 2 with verifiable provenance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. INTELLIGENT DELEGATION / INTERACTIVE WORKFLOW SHOWCASE */}
      <section id="workflow" className="parley-section parley-section-light">
        <div className="parley-section-header">
          <div>
            <span className="parley-eyebrow">Intelligent Delegation</span>
            <h2 className="parley-section-title">
              Feed mixed speech once. <br />
              <span className="parley-serif-italic">Weave demixes the rest.</span>
            </h2>
          </div>
          <p className="parley-section-lead">
            Provide unconstrained conversational audio with simultaneous talkers. OverlapWeave breaks it into acoustic features, predicts utility, demixes streams, and attributes every word — keeping you updated along the way.
          </p>
        </div>

        <div className="parley-workflow-showcase">
          {/* Left: Interactive Accordion Tabs */}
          <div className="parley-workflow-tabs">
            {workflows.map((wf, idx) => {
              const isActive = activeWorkflowIndex === idx;
              return (
                <div
                  key={wf.id}
                  onClick={() => setActiveWorkflowIndex(idx)}
                  className={`parley-workflow-tab-item ${isActive ? 'active' : ''}`}
                >
                  <div className="parley-tab-title-row">
                    {isActive && (
                      <span className="parley-tab-arrow">
                        <ChevronRight size={16} strokeWidth={3} className="text-amber-600 inline" />
                        <ChevronRight size={16} strokeWidth={3} className="text-amber-600 inline -ml-2" />
                      </span>
                    )}
                    <h4 className="parley-tab-title">{wf.label}</h4>
                  </div>
                  {isActive && <p className="parley-tab-desc">{wf.desc}</p>}
                </div>
              );
            })}

            <div className="parley-workflow-tab-cta">
              <button
                onClick={() => onNavigate('studio', 'overlap')}
                className="parley-btn"
              >
                <span className="parley-btn-icon">
                  <ChevronRight size={16} strokeWidth={2.5} />
                </span>
                <span className="parley-btn-label">Try this workflow live</span>
              </button>
            </div>
          </div>

          {/* Right: macOS Application Window Mockup */}
          <div className="parley-mac-window">
            <div className="parley-window-titlebar">
              <div className="parley-window-dots">
                <span className="dot dot-red"></span>
                <span className="dot dot-yellow"></span>
                <span className="dot dot-green"></span>
              </div>
              <div className="parley-window-title">OverlapWeave Pipeline Controller</div>
              <div className="parley-window-badge">MPS Accelerated</div>
            </div>

            <div className="parley-window-body">
              {/* Mini Sidebar */}
              <div className="parley-window-sidebar">
                <div className="parley-ws-header">
                  <span className="parley-ws-avatar">OW</span>
                  <span className="parley-ws-name">AudioLab</span>
                </div>
                <div className="parley-ws-section-label">WORKSPACE</div>
                <div className="parley-ws-item active">
                  <span>+ New Transcript</span>
                </div>
                <div className="parley-ws-item">
                  <span>Inbox</span>
                  <span className="parley-ws-count">3</span>
                </div>
                <div className="parley-ws-item">
                  <span>Tasks</span>
                  <span className="parley-ws-count">12</span>
                </div>
                <div className="parley-ws-section-label">LIBRARY</div>
                <div className="parley-ws-item">
                  <span>Profiles</span>
                </div>
                <div className="parley-ws-item">
                  <span>Integrations</span>
                </div>
              </div>

              {/* Main Window Area */}
              <div className="parley-window-main">
                <div className="parley-window-task-header">
                  <div className="task-breadcrumb">Tasks / <strong>Pipeline Execution</strong></div>
                  <div className="task-prompt-input">
                    <span className="prompt-chevron">&gt;</span>
                    <span className="prompt-text">{currentWorkflow.taskPrompt}</span>
                    <span className="prompt-cursor"></span>
                  </div>
                </div>

                <div className="parley-window-intent">
                  <span>Intent · </span>
                  <strong>{currentWorkflow.tag} · 4 steps</strong>
                </div>

                {/* Step List */}
                <div className="parley-steps-list">
                  {currentWorkflow.steps.map((st, i) => (
                    <div
                      key={i}
                      className={`parley-step-row status-${st.status}`}
                    >
                      <div className="step-num">{i + 1}</div>
                      <div className="step-content">
                        <div className="step-label">{st.label}</div>
                        <div className="step-detail">{st.detail}</div>
                      </div>
                      <div className="step-indicator">
                        {st.status === 'done' && <CheckCircle2 size={16} className="text-emerald-600" />}
                        {st.status === 'active' && <div className="step-spinner"></div>}
                        {st.status === 'pending' && <span className="step-dot"></span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="parley-window-actions">
                  <button onClick={() => onNavigate('studio')} className="mini-action-btn primary">
                    Open in Studio
                  </button>
                  <button onClick={() => onNavigate('routing')} className="mini-action-btn secondary">
                    Tune Lambda
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. INTEGRATIONS SECTION */}
      <section id="integrations" className="parley-section">
        <div className="parley-section-header parley-center-header">
          <span className="parley-eyebrow">Integrations</span>
          <h2 className="parley-section-title">
            Connect your speech pipeline. <br />
            <span className="parley-serif-italic">OverlapWeave meets you there.</span>
          </h2>
          <p className="parley-section-lead center">
            PyTorch, faster-whisper, Torchaudio, FastAPI, Hugging Face, and Web Audio.
            OverlapWeave triggers actions, fetches acoustic context, and keeps transcripts synchronized — right where your team already works.
          </p>
        </div>

        {/* 2 ROWS OF SOFT ROUNDED TILES */}
        <div className="parley-integrations-wrap">
          <div className="parley-integrations-row">
            <div className="parley-tool-tile" title="PyTorch 2.x MPS & CUDA acceleration">
              <div className="tool-logo-mark pytorch">🔥</div>
              <span className="tool-name">PyTorch</span>
            </div>
            <div className="parley-tool-tile" title="faster-whisper int8 inference engine">
              <div className="tool-logo-mark whisper">🎙️</div>
              <span className="tool-name">faster-whisper</span>
            </div>
            <div className="parley-tool-tile" title="Torchaudio separation pipelines">
              <div className="tool-logo-mark torchaudio">🔊</div>
              <span className="tool-name">Torchaudio</span>
            </div>
            <div className="parley-tool-tile" title="FastAPI async REST endpoints">
              <div className="tool-logo-mark fastapi">⚡</div>
              <span className="tool-name">FastAPI</span>
            </div>
            <div className="parley-tool-tile" title="Hugging Face models & Hub">
              <div className="tool-logo-mark huggingface">🤗</div>
              <span className="tool-name">Hugging Face</span>
            </div>
            <div className="parley-tool-tile" title="Docker reproducible containers">
              <div className="tool-logo-mark docker">🐳</div>
              <span className="tool-name">Docker</span>
            </div>
          </div>

          <div className="parley-integrations-row">
            <div className="parley-tool-tile" title="Python 3.11 scientific stack">
              <div className="tool-logo-mark python">🐍</div>
              <span className="tool-name">Python 3.11</span>
            </div>
            <div className="parley-tool-tile" title="Web Audio & PyAV in-memory decoding">
              <div className="tool-logo-mark webaudio">🎛️</div>
              <span className="tool-name">Web Audio API</span>
            </div>
            <div className="parley-tool-tile" title="Librosa & SciPy signal processing">
              <div className="tool-logo-mark librosa">📊</div>
              <span className="tool-name">Librosa / SciPy</span>
            </div>
            <div className="parley-tool-tile" title="React 19 & TypeScript frontend">
              <div className="tool-logo-mark react">⚛️</div>
              <span className="tool-name">React 19</span>
            </div>
            <div className="parley-tool-tile" title="WebRTC real-time microphone capture">
              <div className="tool-logo-mark webrtc">📡</div>
              <span className="tool-name">WebRTC</span>
            </div>
            <div className="parley-tool-tile" title="GitHub Actions CI/CD automation">
              <div className="tool-logo-mark github">🐙</div>
              <span className="tool-name">GitHub Actions</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. RESEARCH BENCHMARKS CALLOUT */}
      <section className="parley-section parley-section-light">
        <div className="parley-section-header parley-center-header">
          <span className="parley-eyebrow">Empirical Results</span>
          <h2 className="parley-section-title">
            Proven performance on <br />
            <span className="parley-serif-italic">challenging multi-talker speech</span>
          </h2>
        </div>

        <div className="parley-metrics-grid">
          <div className="parley-metric-card">
            <div className="metric-val text-amber-600">27.6%</div>
            <div className="metric-title">Speaker-Attributed WER</div>
            <div className="metric-desc">Outperforms mixture-only baseline by over 38% relative error reduction on overlapping speech.</div>
          </div>

          <div className="parley-metric-card">
            <div className="metric-val text-blue-600">5.8×</div>
            <div className="metric-title">Latency Speedup</div>
            <div className="metric-desc">680.2 ms P50 latency compared to 1,914 ms for brute-force Always-Separate pipeline.</div>
          </div>

          <div className="parley-metric-card">
            <div className="metric-val text-emerald-600">35%</div>
            <div className="metric-title">Separation Invoked</div>
            <div className="metric-desc">Bypasses Conv-TasNet on 65% of regions, eliminating musical noise and compute waste.</div>
          </div>

          <div className="parley-metric-card">
            <div className="metric-val text-violet-600">0.0%</div>
            <div className="metric-title">Clean Degradation</div>
            <div className="metric-desc">Zero accuracy loss on clean, single-speaker segments by preserving the original mixture.</div>
          </div>
        </div>

        <div className="parley-bench-cta-wrap">
          <button
            onClick={() => onNavigate('benchmarks')}
            className="parley-btn"
          >
            <span className="parley-btn-icon">
              <ChevronRight size={16} strokeWidth={2.5} />
            </span>
            <span className="parley-btn-label">View Full Benchmark Table</span>
          </button>
        </div>
      </section>

      {/* 7. BOTTOM BANNER CTA CARD */}
      <section className="parley-banner-section">
        <div className="parley-banner-card">
          <div className="parley-banner-overlay"></div>
          <div className="parley-banner-content">
            <h2 className="parley-banner-title">
              Meet your speech partner. <br />
              <span className="parley-serif-italic">Built for real conversations.</span>
            </h2>
            <p className="parley-banner-subtitle">
              Join researchers and engineers evaluating next-generation speech separation.
              Set up in minutes. Run locally on CPU or Apple Silicon MPS.
            </p>
            <div className="parley-banner-cta-group">
              <button
                onClick={() => onNavigate('studio', 'overlap')}
                className="parley-btn parley-btn-large"
              >
                <span className="parley-btn-icon">
                  <ChevronRight size={18} strokeWidth={2.5} />
                </span>
                <span className="parley-btn-label">Get started free</span>
              </button>

              <button
                onClick={() => onNavigate('studio', 'clean')}
                className="parley-banner-secondary-btn"
              >
                <span>Try Clean Speech Preset</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 8. EDITORIAL FOOTER */}
      <footer className="parley-footer">
        <div className="parley-footer-container">
          <div className="parley-footer-top">
            <div className="parley-footer-brand-col">
              <div className="parley-logo">
                <div className="parley-logo-mark">
                  <span className="parley-logo-icon">OW</span>
                </div>
                <span className="parley-logo-text">OverlapWeave</span>
              </div>
              <p className="parley-footer-tagline">
                Benefit-Aware Adaptive Speech Separation for Speaker-Attributed ASR in Overlapping Tamil–English Conversations.
              </p>
              <div className="parley-footer-tags">
                <span className="footer-tag">PyTorch 2.x</span>
                <span className="footer-tag">faster-whisper</span>
                <span className="footer-tag">ConvTasNet</span>
                <span className="footer-tag">Apache 2.0</span>
              </div>
            </div>

            <div className="parley-footer-links-grid">
              <div className="parley-footer-col">
                <h5 className="footer-col-title">Studio &amp; Tools</h5>
                <ul>
                  <li><button onClick={() => onNavigate('studio')} className="footer-link">ASR Studio</button></li>
                  <li><button onClick={() => onNavigate('inspector')} className="footer-link">Overlap Inspector</button></li>
                  <li><button onClick={() => onNavigate('routing')} className="footer-link">Adaptive Routing Lab</button></li>
                  <li><button onClick={() => onNavigate('benchmarks')} className="footer-link">Benchmarks &amp; Metrics</button></li>
                </ul>
              </div>

              <div className="parley-footer-col">
                <h5 className="footer-col-title">Architecture</h5>
                <ul>
                  <li><a href="#workflow" className="footer-link">Multi-Pitch Detection</a></li>
                  <li><a href="#why-weave" className="footer-link">Benefit Controller</a></li>
                  <li><a href="#workflow" className="footer-link">Conv-TasNet Demixer</a></li>
                  <li><a href="#workflow" className="footer-link">Transcript Reconciler</a></li>
                </ul>
              </div>

              <div className="parley-footer-col">
                <h5 className="footer-col-title">Research &amp; Docs</h5>
                <ul>
                  <li><button onClick={() => onNavigate('benchmarks')} className="footer-link">SA-WER Metric</button></li>
                  <li><a href="https://github.com/overlapweave/overlapweave" target="_blank" rel="noreferrer" className="footer-link">GitHub Repository</a></li>
                  <li><a href="/README.md" className="footer-link">Implementation Plan</a></li>
                  <li><a href="/SPEC.md" className="footer-link">Project Specification</a></li>
                </ul>
              </div>

              <div className="parley-footer-col">
                <h5 className="footer-col-title">Project</h5>
                <ul>
                  <li><span className="footer-text">College Task 2 ASR</span></li>
                  <li><span className="footer-text">Tamil-English (Tanglish)</span></li>
                  <li><span className="footer-text">Apple Silicon MPS</span></li>
                  <li><span className="footer-text">Apache 2.0 License</span></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="parley-footer-bottom">
            <div className="parley-footer-copy">
              © 2026 OverlapWeave. Research &amp; Engineering by the OverlapWeave Team.
            </div>
            <div className="parley-footer-socials">
              <span className="social-pill">Designed with precision</span>
              <span className="social-pill">Framer Inspired</span>
            </div>
          </div>
        </div>
      </footer>

      {/* 9. FLOATING ACTION PILL ON BOTTOM RIGHT */}
      <div className="parley-floating-pill">
        <button
          onClick={() => onNavigate('studio')}
          className="floating-pill-btn"
          title="Jump to ASR Studio"
        >
          <span className="floating-pill-icon">
            <ArrowUpRight size={14} className="text-amber-500" />
          </span>
          <span className="floating-pill-text">Launch Studio</span>
        </button>
      </div>
    </div>
  );
}
