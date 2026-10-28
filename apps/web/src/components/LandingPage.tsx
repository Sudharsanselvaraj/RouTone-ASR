import { useEffect, useRef, useState } from 'react';
import { useWorkbench } from '../state/store';
import { WordmarkMark } from './ui';
import { TechMarquee } from './TechMarquee';
import { FeatureCards } from './FeatureCards';
import { asset } from '../lib/assets';
import {
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (tab: 'overview' | 'studio' | 'inspector' | 'routing' | 'benchmarks', preset?: 'overlap' | 'clean') => void;
}

/** Scroll-reveal: fades and lifts marked elements into view once, respecting reduced motion. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targets = [...root.querySelectorAll<HTMLElement>(
      '.parley-section-header, .fc-row, .parley-workflow-showcase, .tech-marquee, .parley-metric-card, .parley-bench-cta-wrap, .parley-banner-content, .parley-footer-top',
    )];
    if (reduce || !('IntersectionObserver' in window)) return;
    targets.forEach((t, i) => {
      t.classList.add('reveal');
      t.style.setProperty('--reveal-delay', `${(i % 4) * 70}ms`);
    });
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const wb = useWorkbench();
  const bench = wb.benchmark;
  const rootRef = useReveal();

  // Capability showcase workflow index
  const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);

  const workflows = [
    {
      id: 'wf-mixture',
      label: 'Original-mixture transcription',
      tag: 'Stage 1 · Baseline ASR',
      desc: 'Transcribe natural multi-talker audio with faster-whisper int8 to obtain baseline word timestamps, segment bounds, and acoustic confidence scores before routing.',
      taskPrompt: 'transcribe mixture [eval_te_01.wav · 5.2s]',
      steps: [
        { label: 'Ingest 16 kHz mono waveform', status: 'done', detail: 'Duration and signal estimates are recorded' },
        { label: 'Run faster-whisper int8 multilingual decode', status: 'done', detail: 'Language is detected or set manually' },
        { label: 'Generate word-level timestamp alignment', status: 'active', detail: 'Per-word times and confidences' },
        { label: 'Extract average segment log-probability', status: 'pending', detail: 'Baseline hypothesis saved for reconciliation' }
      ]
    },
    {
      id: 'wf-overlap',
      label: 'Overlap-region detection',
      tag: 'Stage 2 · Multi-Pitch Analysis',
      desc: 'Detect concurrent voiced intervals using multi-pitch tracking, harmonic clash analysis (C_harm), and subharmonic octave filtering to avoid false alarms.',
      taskPrompt: 'detect overlap collisions [region_01]',
      steps: [
        { label: 'Compute STFT spectrogram & spectral peaks', status: 'done', detail: 'Frame-level acoustic features' },
        { label: 'Filter subharmonic integer multiples (2×, 3× F0)', status: 'done', detail: 'Octave multiples of one voice are not counted as a second' },
        { label: 'Isolate candidate overlap windows', status: 'active', detail: 'Heuristic pitch-clash and overlap scores' },
        { label: 'Forward candidate region to routing controller', status: 'pending', detail: 'Each region carries its time span and scores' }
      ]
    },
    {
      id: 'wf-routing',
      label: 'Selective speech separation',
      tag: 'Stage 3 · Adaptive Controller',
      desc: 'Estimate expected recognition utility before routing each eligible region. Demix concurrent talkers via Conv-TasNet only when predicted ASR gain exceeds compute penalty.',
      taskPrompt: 'compute routing utility [U = E[ΔAcc] - λ·Cost]',
      steps: [
        { label: 'Extract feature vector (overlap dur, logprob, clash)', status: 'done', detail: 'Duration, log-probability, clash, overlap score' },
        { label: 'Estimate expected benefit (heuristic)', status: 'done', detail: 'Uncalibrated prediction, labelled as such' },
        { label: 'Calculate net utility: benefit − λ·cost', status: 'active', detail: 'Compared with a decision margin' },
        { label: 'Execute ConvTasNet separation forward pass', status: 'pending', detail: 'Demixing Stream 1 & Stream 2 (ConvTasNet, CPU)' }
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
        { label: 'Deduplicate cross-stream acoustic leakage', status: 'done', detail: 'Duplicate cross-talk segments are removed' },
        { label: 'Filter degenerate hallucination repetition loops', status: 'done', detail: 'Repetition filter on separated text' },
        { label: 'Generate unified speaker-attributed transcript', status: 'active', detail: 'Segments carry speaker and source stream' }
      ]
    }
  ];

  const currentWorkflow = workflows[activeWorkflowIndex];

  return (
    <div className="parley-landing" ref={rootRef}>
      {/* 1. TOP NAVIGATION BAR */}
      <header className="parley-nav">
        <div className="parley-nav-container">
          <div className="parley-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="parley-logo-mark">
              <WordmarkMark size={22} />
            </div>
            <span className="parley-logo-text">Routone</span>
          </div>

          <nav className="parley-nav-links">
            <a href="#why-routone">Why Routone</a>
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
              Understand mixed speech. <br />
              <span className="parley-serif-italic">Route only when necessary.</span>
            </h1>

            <p className="parley-hero-subtitle">
              Routone compares the original mixture with separated speech and selectively routes difficult
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

        {/* LOGO STRIP: same pattern as Parley's "Trusted by" row, monochrome mark + wordmark */}
        <div className="parley-partners-bar">
          <p className="parley-partners-label">Built on open tools. Designed for overlapping speech.</p>
          <ul className="parley-partners-grid" aria-label="Open tools Routone is built on">
            {[
              ['PyTorch', 'pytorch'],
              ['Hugging Face', 'huggingface'],
              ['Whisper', 'openai'],
              ['FFmpeg', 'ffmpeg'],
              ['FastAPI', 'fastapi'],
            ].map(([name, icon]) => (
              <li className="parley-partner-item" key={name}>
                <span className="partner-icon" style={{ ['--icon' as string]: `url(${asset(`logos/${icon}.svg`)})` }} aria-hidden="true" />
                <span className="partner-name">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. WHY ROUTONE SECTION — EXPANDABLE FEATURE CARDS */}
      <section id="why-routone" className="parley-section">
        <div className="parley-section-header">
          <div>
            <span className="parley-eyebrow">Why Routone</span>
            <h2 className="parley-section-title">
              A selective partner, <br />
              <span className="parley-serif-italic">not brute-force separation</span>
            </h2>
          </div>
          <p className="parley-section-lead">
            Most multi-talker speech systems either ignore overlapping talkers entirely or apply costly separation to every second.
            Routone estimates the expected recognition benefit before routing each region — preserving single-speaker clarity and slashing latency.
          </p>
        </div>

        <FeatureCards />
      </section>

      {/* 4. INTELLIGENT DELEGATION / INTERACTIVE WORKFLOW SHOWCASE */}
      <section id="workflow" className="parley-section parley-section-light">
        <div className="parley-section-header">
          <div>
            <span className="parley-eyebrow">Intelligent Delegation</span>
            <h2 className="parley-section-title">
              Feed mixed speech once. <br />
              <span className="parley-serif-italic">Routone demixes the rest.</span>
            </h2>
          </div>
          <p className="parley-section-lead">
            Provide unconstrained conversational audio with simultaneous talkers. Routone breaks it into acoustic features, predicts utility, demixes streams, and attributes every word — keeping you updated along the way.
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
              <div className="parley-window-title">Routone pipeline</div>
              <div className="parley-window-badge">Illustrative workflow</div>
            </div>

            <div className="parley-window-body">
              {/* Mini Sidebar */}
              <div className="parley-window-sidebar">
                <div className="parley-ws-header">
                  <span className="parley-ws-avatar">R</span>
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

      {/* 5. TECHNOLOGY — two-row marquee of real project logos, same pattern as Parley's integrations */}
      <section id="integrations" className="parley-section parley-section-light">
        <div className="parley-section-header parley-center-header">
          <span className="parley-eyebrow">Technology</span>
          <h2 className="parley-section-title">
            Connect your speech pipeline. <br />
            <span className="parley-serif-italic">Routone meets you there.</span>
          </h2>
          <p className="parley-section-lead center">
            PyTorch, torchaudio, librosa, faster-whisper with Silero VAD, FFmpeg and more. Open tools, wired into one workbench.
          </p>
        </div>
        <TechMarquee />
      </section>

      {/* 6. EVALUATION — live state of the saved benchmark, never hardcoded numbers */}
      <section className="parley-section parley-section-light">
        <div className="parley-section-header parley-center-header">
          <span className="parley-eyebrow">Evaluation</span>
          <h2 className="parley-section-title">
            Claims follow the data. <br />
            <span className="parley-serif-italic">Nothing is shown that wasn’t measured.</span>
          </h2>
          <p className="parley-section-lead center">
            {bench
              ? `Latest saved benchmark: ${bench.dataset_name}. Status: ${bench.status ?? 'legacy report (validity unknown)'}.`
              : wb.backend === 'offline'
                ? 'Start the backend to see the latest benchmark status.'
                : 'No benchmark has been run yet.'}
          </p>
        </div>

        {bench && (
          <div className="parley-metrics-grid">
            <div className="parley-metric-card">
              <div className="metric-val">{bench.results.length}</div>
              <div className="metric-title">Strategies evaluated</div>
              <div className="metric-desc">Only strategies that actually ran are listed.</div>
            </div>
            <div className="parley-metric-card">
              <div className="metric-val">{bench.dataset?.samples_evaluated ?? bench.results[0]?.evaluated_samples_count ?? '—'}</div>
              <div className="metric-title">Recordings scored</div>
              <div className="metric-desc">Small samples cannot support claims of improvement.</div>
            </div>
            <div className="parley-metric-card">
              <div className="metric-val">{bench.status ?? 'unknown'}</div>
              <div className="metric-title">Experiment status</div>
              <div className="metric-desc">{(bench.warnings ?? [])[0] ?? 'Re-run the benchmark to attach integrity checks.'}</div>
            </div>
          </div>
        )}

        <div className="parley-bench-cta-wrap">
          <button onClick={() => onNavigate('benchmarks')} className="parley-btn">
            <span className="parley-btn-icon">
              <ChevronRight size={16} strokeWidth={2.5} />
            </span>
            <span className="parley-btn-label">Open Benchmarks</span>
          </button>
        </div>
      </section>

      {/* 7. BOTTOM BANNER CTA CARD */}
      <section className="parley-banner-section">
        <div className="parley-banner-card">
          <div className="parley-banner-overlay"></div>
          <div className="parley-banner-content">
            <h2 className="parley-banner-title">
              Meet your research instrument. <br />
              <span className="parley-serif-italic">Built for overlapping speech.</span>
            </h2>
            <p className="parley-banner-subtitle">
              Explore when speech separation is worth its cost.
              Runs locally on your machine, on CPU.
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
                  <WordmarkMark size={22} />
                </div>
                <span className="parley-logo-text">Routone</span>
              </div>
              <p className="parley-footer-tagline">
                Adaptive routing for overlapping speech recognition.
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
                  <li><a href="#why-routone" className="footer-link">Benefit Controller</a></li>
                  <li><a href="#workflow" className="footer-link">Conv-TasNet Demixer</a></li>
                  <li><a href="#workflow" className="footer-link">Transcript Reconciler</a></li>
                </ul>
              </div>

              <div className="parley-footer-col">
                <h5 className="footer-col-title">Research &amp; Docs</h5>
                <ul>
                  <li><button onClick={() => onNavigate('benchmarks')} className="footer-link">SA-WER Metric</button></li>
                  <li><a href="https://github.com/Sudharsanselvaraj/RouTone-ASR" target="_blank" rel="noreferrer" className="footer-link">GitHub Repository</a></li>
                  <li><a href="https://github.com/Sudharsanselvaraj/RouTone-ASR#readme" target="_blank" rel="noreferrer" className="footer-link">README</a></li>
                  <li><a href="https://github.com/Sudharsanselvaraj/RouTone-ASR/blob/main/SPEC.md" target="_blank" rel="noreferrer" className="footer-link">Project Specification</a></li>
                </ul>
              </div>

              <div className="parley-footer-col">
                <h5 className="footer-col-title">Project</h5>
                <ul>
                  <li><span className="footer-text">Speech research workbench</span></li>
                  <li><span className="footer-text">Tamil-English (Tanglish)</span></li>
                  <li><span className="footer-text">Runs locally on CPU</span></li>
                  <li><span className="footer-text">Apache 2.0 License</span></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="parley-footer-bottom">
            <div className="parley-footer-copy">
              © 2026 Routone.
            </div>
            <div className="parley-footer-socials">
              <span className="social-pill">Understand mixed speech. Route only when necessary.</span>
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
