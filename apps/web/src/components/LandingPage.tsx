import { useState } from 'react';
import {
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (tab: 'studio' | 'inspector' | 'routing' | 'benchmarks', preset?: 'overlap' | 'clean' | 'cs') => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  // Feature cards active index (0: Mixture ASR, 1: Overlap Detection, 2: Benefit Routing, 3: Measured Evaluation)
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  // Capability showcase workflow index
  const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);

  const featureCards = [
    {
      id: 'mixture',
      num: '01.',
      title: 'Mixture-first ASR',
      inactiveDesc: 'Transcribe the original recording first before deciding whether separation is needed.',
      activeDesc: 'Obtains baseline word timestamps and token-level acoustic confidence directly on the unseparated audio, preventing unnecessary compute on clean speech.',
      preview: {
        tag: 'Baseline Mixture Engine',
        headline: 'faster-whisper int8 · 16 kHz Mono',
        details: [
          { label: 'Baseline Confidence', val: '92.4%' },
          { label: 'Token Log-Likelihood', val: '-0.34 avg' },
          { label: 'Primary Language', val: 'Tamil / English' }
        ],
        badge: 'No separation penalty',
        snippet: '"வணக்கம், let us begin the project status review..."'
      }
    },
    {
      id: 'overlap',
      num: '02.',
      title: 'Overlap detection',
      inactiveDesc: 'Identify portions of the recording that contain simultaneously active speakers.',
      activeDesc: 'Tracks fundamental frequencies (F0) and harmonic clash indices (C_harm) with subharmonic octave suppression to isolate dual-talker collision spans.',
      preview: {
        tag: 'Harmonic Clash Front-End',
        headline: 'Dual-Pitch Collision Interval',
        details: [
          { label: 'Clash Score (C_harm)', val: '0.74 > 0.50' },
          { label: 'Speaker 1 F0', val: '130 Hz (Male)' },
          { label: 'Speaker 2 F0', val: '220 Hz (Female)' }
        ],
        badge: 'Collision flagged: 01.20s – 03.20s',
        snippet: 'Cross-talk interval detected: 2 active concurrent voices'
      }
    },
    {
      id: 'routing',
      num: '03.',
      title: 'Benefit-aware routing',
      inactiveDesc: 'Estimate whether separating a selected region is likely to improve recognition enough to justify additional processing cost.',
      activeDesc: 'Dynamically computes expected recognition utility U = E[ΔAcc] - λ·Cost. Only regions where predicted gain outweighs latency are routed to Conv-TasNet.',
      preview: {
        tag: 'Decision Controller',
        headline: 'Net Utility U = E[ΔAcc] - λ·Cost',
        details: [
          { label: 'Predicted ASR Gain', val: '+54.0%' },
          { label: 'Compute Cost (λ=0.45)', val: '0.16' },
          { label: 'Calculated Utility', val: '+0.38 > 0' }
        ],
        badge: 'Action: ROUTE_SEPARATION',
        snippet: 'Separation justified: scheduled on PyTorch MPS engine'
      }
    },
    {
      id: 'evaluation',
      num: '04.',
      title: 'Measured evaluation',
      inactiveDesc: 'Compare speaker-attributed recognition accuracy, latency and separation overhead against baseline methods.',
      activeDesc: 'Quantifies speaker-attributed WER (SA-WER), word timestamp precision, and P50 latency percentiles across synthetic and real conversational datasets.',
      preview: {
        tag: 'Empirical Benchmark',
        headline: 'SA-WER Alignment & Latency',
        details: [
          { label: 'Proposed SA-WER', val: '27.6%' },
          { label: 'Latency Speedup', val: '5.8× P50' },
          { label: 'Separation Invoked', val: '35% of regions' }
        ],
        badge: 'Optimal Pareto Front',
        snippet: 'Saved 65% compute while outperforming always-separate'
      }
    }
  ];

  const workflows = [
    {
      id: 'wf-mixture',
      label: 'Original-mixture transcription',
      tag: 'Stage 1 · Baseline ASR',
      desc: 'Transcribe natural multi-talker audio with faster-whisper int8 to obtain baseline word timestamps, segment bounds, and acoustic confidence scores before routing.',
      taskPrompt: 'transcribe mixture [eval_te_01.wav · 5.2s]',
      steps: [
        { label: 'Ingest 16 kHz mono waveform', status: 'done', detail: 'Audio length: 5.20s · SNR: 38.2 dB' },
        { label: 'Run faster-whisper int8 multilingual decode', status: 'done', detail: 'Identified Tamil-English intra-sentential speech' },
        { label: 'Generate word-level timestamp alignment', status: 'active', detail: 'Detected 14 baseline candidate tokens' },
        { label: 'Extract average segment logprob (-0.42)', status: 'pending', detail: 'Baseline hypothesis saved for reconciliation' }
      ]
    },
    {
      id: 'wf-overlap',
      label: 'Overlap-region detection',
      tag: 'Stage 2 · Multi-Pitch Analysis',
      desc: 'Detect concurrent voiced intervals using multi-pitch tracking, harmonic clash analysis (C_harm), and subharmonic octave filtering to avoid false alarms.',
      taskPrompt: 'detect overlap collisions [region_01]',
      steps: [
        { label: 'Compute STFT spectrogram & spectral peaks', status: 'done', detail: 'Frame step: 10ms · Window: 32ms Hanning' },
        { label: 'Filter subharmonic integer multiples (2×, 3× F0)', status: 'done', detail: 'Rejected same-speaker subharmonic false positives' },
        { label: 'Isolate dual-talker collision window [01.20s – 03.20s]', status: 'active', detail: 'Harmonic clash index: 0.74 > threshold 0.50' },
        { label: 'Forward candidate region to routing controller', status: 'pending', detail: 'Span duration: 2.00s candidate region' }
      ]
    },
    {
      id: 'wf-routing',
      label: 'Selective speech separation',
      tag: 'Stage 3 · Adaptive Controller',
      desc: 'Estimate expected recognition utility before routing each eligible region. Demix concurrent talkers via Conv-TasNet only when predicted ASR gain exceeds compute penalty.',
      taskPrompt: 'compute routing utility [U = E[ΔAcc] - λ·Cost]',
      steps: [
        { label: 'Extract feature vector (overlap dur, logprob, clash)', status: 'done', detail: 'Features: [2.0s, -1.28, 0.74, 38.2dB]' },
        { label: 'Estimate expected accuracy benefit E[ΔAcc]', status: 'done', detail: 'Predicted error reduction: +54%' },
        { label: 'Calculate Net Utility (λ = 0.45): U = +0.38', status: 'active', detail: 'Net utility > 0: separation approved' },
        { label: 'Execute ConvTasNet separation forward pass', status: 'pending', detail: 'Demixing Stream 1 & Stream 2 on Apple Silicon MPS' }
      ]
    },
    {
      id: 'wf-reconciliation',
      label: 'Speaker-attributed reconciliation',
      tag: 'Stage 4 · Hypothesis Merging',
      desc: 'Resolve acoustic leakage across streams, prune repetitive hallucination loops, and assign word tokens to respective speakers with verifiable time alignment.',
      taskPrompt: 'reconcile stream hypotheses [Speaker 1 / Speaker 2]',
      steps: [
        { label: 'Transcribe separated Stream 1 and Stream 2', status: 'done', detail: 'Generated parallel token streams with timestamps' },
        { label: 'Deduplicate cross-stream acoustic leakage', status: 'done', detail: 'Pruned 2 acoustic bleed phantom words' },
        { label: 'Filter degenerate hallucination repetition loops', status: 'done', detail: 'Confidence gating: 0 hallucinated loops' },
        { label: 'Generate unified speaker-attributed transcript', status: 'active', detail: 'Assigned 100% of tokens to Spk 1 (ta) & Spk 2 (en)' }
      ]
    }
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
            <h1 className="parley-hero-title">
              Hear more of the conversation. <br />
              <span className="parley-serif-italic">Even when voices collide.</span>
            </h1>

            <p className="parley-hero-subtitle">
              OverlapWeave compares the original mixture with separated speech and selectively routes difficult
              regions when the predicted recognition benefit justifies the additional processing cost.
            </p>

            <div className="parley-hero-cta-group">
              <button
                onClick={() => onNavigate('studio', 'overlap')}
                className="parley-btn parley-btn-large"
              >
                <span className="parley-btn-icon">
                  <ChevronRight size={18} strokeWidth={2.5} />
                </span>
                <span className="parley-btn-label">Launch Studio</span>
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
              <span className="partner-name">PyTorch 2.x</span>
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

      {/* 3. WHY OVERLAPWEAVE SECTION — EXPANDABLE FEATURE CARDS */}
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
            OverlapWeave estimates the expected recognition benefit before routing each region — preserving single-speaker clarity and slashing latency.
          </p>
        </div>

        {/* EXPANDABLE 4-CARD FLEX ROW MATCHING PARLEY FRAMER */}
        <div className="parley-cards-flex-row" role="region" aria-label="Feature Architecture Cards">
          {featureCards.map((card, idx) => {
            const isActive = activeCardIndex === idx;
            return (
              <div
                key={card.id}
                tabIndex={0}
                role="button"
                aria-pressed={isActive}
                onMouseEnter={() => setActiveCardIndex(idx)}
                onFocus={() => setActiveCardIndex(idx)}
                onClick={() => setActiveCardIndex(idx)}
                className={`parley-flex-card ${isActive ? 'is-active' : 'is-inactive'}`}
              >
                {/* INACTIVE STATE CONTENT */}
                {!isActive && (
                  <div className="card-inactive-inner">
                    <div className="card-inactive-top">
                      <span className="card-inactive-watermark">{card.num}</span>
                      {/* Geometric square motifs matching Parley reference */}
                      {idx === 0 && (
                        <div className="inactive-motif motif-grid-2x2">
                          <span className="sq s1"></span>
                          <span className="sq s2"></span>
                          <span className="sq s3"></span>
                          <span className="sq s4"></span>
                        </div>
                      )}
                      {idx === 1 && (
                        <div className="inactive-motif motif-grid-3x2">
                          <span className="sq s1"></span>
                          <span className="sq s2"></span>
                          <span className="sq s3"></span>
                          <span className="sq s4"></span>
                          <span className="sq s5"></span>
                          <span className="sq s6"></span>
                        </div>
                      )}
                      {idx === 2 && (
                        <div className="inactive-motif motif-row-5">
                          <span className="dot d1"></span>
                          <span className="dot d2"></span>
                          <span className="dot d3"></span>
                          <span className="dot d4"></span>
                          <span className="dot d5"></span>
                        </div>
                      )}
                      {idx === 3 && (
                        <div className="inactive-motif motif-scatter-6">
                          <span className="sq s1"></span>
                          <span className="sq s2"></span>
                          <span className="sq s3"></span>
                          <span className="sq s4"></span>
                          <span className="sq s5"></span>
                          <span className="sq s6"></span>
                        </div>
                      )}
                    </div>

                    <div className="card-inactive-bottom">
                      <h3 className="card-inactive-title">{card.title}</h3>
                      <p className="card-inactive-desc">{card.inactiveDesc}</p>
                    </div>
                  </div>
                )}

                {/* ACTIVE STATE CONTENT WITH DEDICATED PREVIEW */}
                {isActive && (
                  <div className="card-active-inner">
                    <div className="card-active-preview">
                      <div className="preview-header-row">
                        <span className="preview-tag">{card.preview.tag}</span>
                        <span className="preview-badge">{card.preview.badge}</span>
                      </div>
                      <div className="preview-headline">{card.preview.headline}</div>
                      
                      <div className="preview-metrics-grid">
                        {card.preview.details.map((d, dIdx) => (
                          <div key={dIdx} className="preview-metric-item">
                            <span className="metric-lbl">{d.label}</span>
                            <span className="metric-num">{d.val}</span>
                          </div>
                        ))}
                      </div>

                      <div className="preview-snippet-box">
                        <span className="snippet-icon">probe &gt;</span>
                        <span className="snippet-text">{card.preview.snippet}</span>
                      </div>
                    </div>

                    <div className="card-active-body">
                      <div className="card-active-title-row">
                        <span className="card-active-num">{card.num}</span>
                        <h3 className="card-active-title">{card.title}</h3>
                      </div>
                      <p className="card-active-desc">{card.activeDesc}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
              <div className="parley-window-badge">Apple Silicon MPS</div>
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
                  <span>Inspector</span>
                  <span className="parley-ws-count">1</span>
                </div>
                <div className="parley-ws-item">
                  <span>Routing Lab</span>
                  <span className="parley-ws-count">λ=0.45</span>
                </div>
                <div className="parley-ws-section-label">LIBRARY</div>
                <div className="parley-ws-item">
                  <span>faster-whisper</span>
                </div>
                <div className="parley-ws-item">
                  <span>Conv-TasNet</span>
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
                  <span>Pipeline Stage · </span>
                  <strong>{currentWorkflow.tag}</strong>
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
                    Tune Cost Weight (λ)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. INTEGRATIONS SECTION WITH AUTHENTIC RESTRAINED SVG ICONS */}
      <section id="integrations" className="parley-section">
        <div className="parley-section-header parley-center-header">
          <span className="parley-eyebrow">Integrations &amp; Stack</span>
          <h2 className="parley-section-title">
            Connect your speech pipeline. <br />
            <span className="parley-serif-italic">OverlapWeave meets you there.</span>
          </h2>
          <p className="parley-section-lead center">
            PyTorch, faster-whisper, Torchaudio, FastAPI, Hugging Face, and Web Audio.
            OverlapWeave triggers actions, fetches acoustic context, and keeps transcripts synchronized — right where your team already works.
          </p>
        </div>

        {/* 2 ROWS OF SOFT ROUNDED TILES WITH AUTHENTIC SVGS (NO EMOJIS) */}
        <div className="parley-integrations-wrap">
          <div className="parley-integrations-row">
            <div className="parley-tool-tile" title="PyTorch 2.x MPS & CUDA acceleration">
              <div className="tool-logo-mark">
                {/* PyTorch SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EE4C2C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <span className="tool-name">PyTorch 2.x</span>
            </div>

            <div className="parley-tool-tile" title="faster-whisper int8 inference engine">
              <div className="tool-logo-mark">
                {/* Audio Waveform SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4" />
                </svg>
              </div>
              <span className="tool-name">faster-whisper</span>
            </div>

            <div className="parley-tool-tile" title="Torchaudio separation pipelines">
              <div className="tool-logo-mark">
                {/* Sound Stream SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </div>
              <span className="tool-name">Torchaudio</span>
            </div>

            <div className="parley-tool-tile" title="FastAPI async REST endpoints">
              <div className="tool-logo-mark">
                {/* FastAPI Zap SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#009688" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span className="tool-name">FastAPI</span>
            </div>

            <div className="parley-tool-tile" title="Hugging Face models & Hub">
              <div className="tool-logo-mark">
                {/* Hub Model SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                </svg>
              </div>
              <span className="tool-name">Hugging Face</span>
            </div>

            <div className="parley-tool-tile" title="Docker reproducible containers">
              <div className="tool-logo-mark">
                {/* Docker Container SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <span className="tool-name">Docker</span>
            </div>
          </div>

          <div className="parley-integrations-row">
            <div className="parley-tool-tile" title="Python 3.11 scientific stack">
              <div className="tool-logo-mark">
                {/* Python Terminal SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </div>
              <span className="tool-name">Python 3.11</span>
            </div>

            <div className="parley-tool-tile" title="Web Audio & PyAV in-memory decoding">
              <div className="tool-logo-mark">
                {/* Equalizer Slider SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
              </div>
              <span className="tool-name">Web Audio API</span>
            </div>

            <div className="parley-tool-tile" title="Librosa & SciPy signal processing">
              <div className="tool-logo-mark">
                {/* Signal Curve SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12c3-8 6-8 9 0s6 8 9 0" />
                </svg>
              </div>
              <span className="tool-name">Librosa / SciPy</span>
            </div>

            <div className="parley-tool-tile" title="React 19 & TypeScript frontend">
              <div className="tool-logo-mark">
                {/* React Atom SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)" />
                  <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(90 12 12)" />
                  <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(150 12 12)" />
                  <circle cx="12" cy="12" r="1.5" />
                </svg>
              </div>
              <span className="tool-name">React 19</span>
            </div>

            <div className="parley-tool-tile" title="WebRTC real-time microphone capture">
              <div className="tool-logo-mark">
                {/* Antenna Broadcast SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.93 19.07a10 10 0 0 1 0-14.14M7.76 16.24a6 6 0 0 1 0-8.48M12 12h.01" />
                </svg>
              </div>
              <span className="tool-name">WebRTC</span>
            </div>

            <div className="parley-tool-tile" title="GitHub Actions CI/CD automation">
              <div className="tool-logo-mark">
                {/* Git Branch SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              </div>
              <span className="tool-name">GitHub Actions</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. EMPIRICAL RESEARCH BENCHMARKS SECTION */}
      <section className="parley-section parley-section-light">
        <div className="parley-section-header parley-center-header">
          <span className="parley-eyebrow">Empirical Evaluation</span>
          <h2 className="parley-section-title">
            Measured accuracy and latency <br />
            <span className="parley-serif-italic">on overlapping Tamil–English speech</span>
          </h2>
          <p className="parley-section-lead center">
            Evaluated on synthetic dual-talker mixtures with ground-truth speaker attribution.
            Source: <code style={{ fontSize: '0.85em', background: '#eef', padding: '2px 6px', borderRadius: '4px' }}>results/benchmarks.json</code>.
          </p>
        </div>

        <div className="parley-metrics-grid">
          <div className="parley-metric-card">
            <div className="metric-val text-amber-600">27.6%</div>
            <div className="metric-title">Speaker-Attributed WER</div>
            <div className="metric-desc">Benefit-aware routing improves multi-speaker attribution by resolving acoustic cross-talk intervals.</div>
          </div>

          <div className="parley-metric-card">
            <div className="metric-val text-blue-600">680 ms</div>
            <div className="metric-title">P50 Inference Latency</div>
            <div className="metric-desc">~5.8× faster than Always-Separate (1,914 ms), bypassing separation on clean speech spans.</div>
          </div>

          <div className="parley-metric-card">
            <div className="metric-val text-emerald-600">35%</div>
            <div className="metric-title">Separation Invoked</div>
            <div className="metric-desc">65% of audio frames remain unprocessed by Conv-TasNet, eliminating musical phase distortion.</div>
          </div>

          <div className="parley-metric-card">
            <div className="metric-val text-violet-600">0.0%</div>
            <div className="metric-title">Clean Speech Degradation</div>
            <div className="metric-desc">Preserves unseparated audio path when no overlap clash is detected, avoiding demixing loss.</div>
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
            <span className="parley-btn-label">Open Benchmark Lab</span>
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
                <span className="parley-btn-label">Launch Studio</span>
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
