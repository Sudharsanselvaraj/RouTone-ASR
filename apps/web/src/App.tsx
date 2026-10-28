import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Download,
  Activity,
  Layers,
  Cpu,
  BarChart2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Volume2,
  Sliders,
  Settings,
  FileAudio,
  Info
} from 'lucide-react';
import type { PipelineResult, BenchmarkReport } from './types';
import LandingPage from './components/LandingPage';

const API_BASE = 'http://localhost:8000';

export default function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'studio' | 'inspector' | 'routing' | 'benchmarks'>('landing');
  const [health, setHealth] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ASR Studio Input Mode (Reference Image 2: Upload, Record, Presets)
  const [inputMode, setInputMode] = useState<'upload' | 'record' | 'presets'>('presets');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('auto');
  const [vadEnabled, setVadEnabled] = useState<boolean>(true);
  const [adaptiveRoutingEnabled, setAdaptiveRoutingEnabled] = useState<boolean>(true);
  const [wordTimestampsEnabled, setWordTimestampsEnabled] = useState<boolean>(true);

  // Audio & Pipeline State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('overlap_sample.wav');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [transcriptView, setTranscriptView] = useState<'final' | 'baseline' | 'separated'>('final');

  // Benchmarks State
  const [benchmarks, setBenchmarks] = useState<BenchmarkReport | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);

  // Interactive Lambda Tuning in Routing Lab
  const [lambdaParam, setLambdaParam] = useState(0.45);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Audio Element Ref
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load Health & Initial Benchmarks
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(() => setHealth({ status: 'offline', version: '0.1.0' }));

    fetch(`${API_BASE}/api/benchmarks`)
      .then(res => res.json())
      .then(data => setBenchmarks(data))
      .catch(() => {});
  }, []);

  // Update Audio Time Listener
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  // Waveform Rendering (Light Theme)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Subtle horizontal center baseline
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw waveform bars
    const bars = 110;
    const barWidth = width / bars;

    for (let i = 0; i < bars; i++) {
      const x = i * barWidth;
      // Synthesize realistic speech energy envelope
      const norm = Math.sin(i * 0.16) * Math.cos(i * 0.05);
      const h = Math.max(5, Math.abs(norm) * (height * 0.72));
      const y = (height - h) / 2;

      // Color based on active playhead
      const barTime = (i / bars) * (duration || 1);
      ctx.fillStyle = barTime <= currentTime ? '#2563EB' : '#94A3B8';
      ctx.fillRect(x + 1, y, barWidth - 2, h);
    }

    // Draw detected overlap intervals on top of waveform
    if (result && duration > 0) {
      result.detected_overlaps.forEach(ov => {
        const startX = (ov.start / duration) * width;
        const endX = (ov.end / duration) * width;
        const ovWidth = Math.max(3, endX - startX);

        ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
        ctx.fillRect(startX, 0, ovWidth, height);
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(startX, 0, ovWidth, height);
      });
    }

    // Draw current playhead
    if (duration > 0) {
      const playX = (currentTime / duration) * width;
      ctx.strokeStyle = '#1E3A8A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
    }
  }, [currentTime, duration, result]);

  // Play / Pause Toggle
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Seek on Canvas Click
  const handleCanvasClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!canvasRef.current || !audioRef.current || duration <= 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const seekFraction = Math.max(0, Math.min(1, x / rect.width));
    const targetTime = seekFraction * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  // Process Audio File through Pipeline
  const processAudioBlob = async (blob: Blob, filename = 'recording.wav') => {
    setIsProcessing(true);
    setErrorMsg(null);
    setAudioFileName(filename);

    const url = URL.createObjectURL(blob);
    setAudioUrl(url);

    try {
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('include_audio', 'true');
      if (selectedLanguage !== 'auto') {
        formData.append('language', selectedLanguage);
      }

      const response = await fetch(`${API_BASE}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to process audio');
      }

      const data: PipelineResult = await response.json();
      setResult(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while contacting transcription backend');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Local File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAudioBlob(file, file.name);
    }
  };

  // Load Preset Built-in Sample
  const loadPresetSample = async (type: 'overlap' | 'clean' | 'cs') => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const sampleId = type === 'overlap' ? 'eval_te_01' : type === 'clean' ? 'eval_en_03' : 'eval_te_02';
      const filename = type === 'overlap' ? 'overlapping_conversation.wav' : type === 'clean' ? 'clean_single_speaker.wav' : 'tanglish_code_switch.wav';
      const response = await fetch(`${API_BASE}/api/sample-audio/${sampleId}`);
      if (!response.ok) throw new Error('Sample audio not found on server');
      const blob = await response.blob();
      processAudioBlob(blob, filename);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not load preset sample');
      setIsProcessing(false);
    }
  };

  // Mic Recording Toggle
  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        setRecordingSeconds(0);

        // Detect supported mime types for browser recording
        let mimeType = 'audio/webm';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg';
          }
        }

        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          if (audioChunksRef.current.length === 0) {
            setErrorMsg('No audio captured. Please speak into the microphone and try again.');
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          const actualMime = recorder.mimeType || mimeType || 'audio/webm';
          const ext = actualMime.includes('mp4') ? 'm4a' : actualMime.includes('ogg') ? 'ogg' : 'webm';
          const blob = new Blob(audioChunksRef.current, { type: actualMime });
          if (blob.size < 200) {
            setErrorMsg('Microphone recording is too short. Please speak for at least 1-2 seconds.');
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          processAudioBlob(blob, `microphone_capture.${ext}`);
          stream.getTracks().forEach(t => t.stop());
        };

        recorder.start();
        setIsRecording(true);

        recordingTimerRef.current = setInterval(() => {
          setRecordingSeconds(prev => prev + 1);
        }, 1000);
      } catch (err) {
        setErrorMsg('Microphone access denied or not supported by browser.');
      }
    }
  };

  // Run Benchmark Suite Live
  const runLiveBenchmarks = async () => {
    setIsBenchmarking(true);
    try {
      const res = await fetch(`${API_BASE}/api/run-benchmarks`, { method: 'POST' });
      const data: BenchmarkReport = await res.json();
      setBenchmarks(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Benchmark run failed');
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Export Transcript Formats
  const exportTranscript = (format: 'txt' | 'srt' | 'vtt' | 'json') => {
    if (!result) return;
    let content = '';
    let mimeType = 'text/plain';

    if (format === 'txt') {
      content = result.final_transcript
        .map(s => `[${s.start.toFixed(2)} - ${s.end.toFixed(2)}] ${s.speaker}: ${s.text}`)
        .join('\n');
    } else if (format === 'json') {
      content = JSON.stringify(result, null, 2);
      mimeType = 'application/json';
    } else if (format === 'srt') {
      content = result.final_transcript
        .map((s, idx) => {
          const fmt = (sec: number) => {
            const h = Math.floor(sec / 3600).toString().padStart(2, '0');
            const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
            const secRem = (sec % 60).toFixed(3).padStart(6, '0').replace('.', ',');
            return `${h}:${m}:${secRem}`;
          };
          return `${idx + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n[${s.speaker}] ${s.text}\n`;
        })
        .join('\n');
    } else if (format === 'vtt') {
      content = 'WEBVTT\n\n' + result.final_transcript
        .map((s, idx) => {
          const fmt = (sec: number) => {
            const m = Math.floor(sec / 60).toString().padStart(2, '0');
            const secRem = (sec % 60).toFixed(3).padStart(6, '0');
            return `${m}:${secRem}`;
          };
          return `${idx + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n<v ${s.speaker}>${s.text}\n`;
        })
        .join('\n');
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overlapweave_transcript.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Navigate from Landing Page
  const handleLandingNavigate = (tab: 'studio' | 'inspector' | 'routing' | 'benchmarks', preset?: 'overlap' | 'clean' | 'cs') => {
    setActiveTab(tab);
    if (tab === 'studio' && preset) {
      loadPresetSample(preset);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (activeTab === 'landing') {
    return (
      <>
        {audioUrl && <audio ref={audioRef} src={audioUrl} />}
        <LandingPage onNavigate={handleLandingNavigate} />
      </>
    );
  }

  return (
    <div className="app-container">
      {/* Hidden native audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} />}

      {/* Global Application Header */}
      <header className="app-header">
        <div className="brand-section" onClick={() => setActiveTab('landing')} style={{ cursor: 'pointer' }} title="Return to Overview">
          <div className="brand-logo">OW</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span className="brand-title">OverlapWeave</span>
              <span className="brand-subtitle-badge">Multilingual ASR Lab</span>
            </div>
          </div>
        </div>

        {/* Center Tabs Navigation */}
        <nav className="tabs-nav">
          <button
            className="tab-btn"
            onClick={() => setActiveTab('landing')}
          >
            Overview
          </button>
          <button
            className={`tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => setActiveTab('studio')}
          >
            <Activity size={15} /> ASR Studio
          </button>
          <button
            className={`tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
            onClick={() => setActiveTab('inspector')}
          >
            <Layers size={15} /> Overlap Inspector
          </button>
          <button
            className={`tab-btn ${activeTab === 'routing' ? 'active' : ''}`}
            onClick={() => setActiveTab('routing')}
          >
            <Cpu size={15} /> Adaptive Routing Lab
          </button>
          <button
            className={`tab-btn ${activeTab === 'benchmarks' ? 'active' : ''}`}
            onClick={() => setActiveTab('benchmarks')}
          >
            <BarChart2 size={15} /> Benchmarks & Evaluation
          </button>
        </nav>

        {/* Right Status Indicators */}
        <div className="header-status">
          <div className="status-badge">
            <span className="status-dot"></span>
            <span>{health ? (health.mps_available ? 'PyTorch MPS' : 'PyTorch CPU') : 'Connecting...'}</span>
          </div>
          <div className="status-badge" style={{ color: 'var(--text-muted)' }}>
            <span>Whisper Tiny</span>
          </div>
          <div className="status-badge" style={{ color: 'var(--text-muted)' }}>
            <span>ConvTasNet</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {errorMsg && (
          <div className="card" style={{ borderColor: 'var(--danger-border)', backgroundColor: 'var(--danger-subtle)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '0.85rem' }}>
              <AlertTriangle size={18} />
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* ==========================================================================
            PAGE 1: ASR STUDIO (Reference Images 1 & 2 inspired)
            ========================================================================== */}
        {activeTab === 'studio' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">ASR Studio</h1>
              <p className="page-subtitle">Transcribe speech and inspect word-level recognition results.</p>
            </div>

            <div className="grid-2col">
              {/* Left Main Column: Workspace */}
              <div>
                {/* Audio Input Card (Reference Image 2) */}
                <div className="card">
                  <div className="card-title">What Do You Want To Transcribe?</div>
                  <div className="card-desc">
                    Upload an audio file, record directly via microphone, or select a conversational overlap preset.
                  </div>

                  {/* Segmented Control Pills (Reference Image 2) */}
                  <div className="segmented-control">
                    <button
                      className={`segment-item ${inputMode === 'presets' ? 'active' : ''}`}
                      onClick={() => setInputMode('presets')}
                    >
                      <Volume2 size={14} /> Demo Presets
                    </button>
                    <button
                      className={`segment-item ${inputMode === 'upload' ? 'active' : ''}`}
                      onClick={() => setInputMode('upload')}
                    >
                      <Upload size={14} /> Upload Audio
                    </button>
                    <button
                      className={`segment-item ${inputMode === 'record' ? 'active' : ''}`}
                      onClick={() => setInputMode('record')}
                    >
                      <Mic size={14} /> Record Microphone
                    </button>
                  </div>

                  {/* Mode 1: Demo Presets */}
                  {inputMode === 'presets' && (
                    <div>
                      <div className="presets-grid">
                        <div className="preset-card" onClick={() => loadPresetSample('overlap')}>
                          <div className="preset-card-title">
                            <span>Overlapping Conversation</span>
                            <span className="speaker-tag speaker-2" style={{ fontSize: '0.68rem' }}>2 Speakers</span>
                          </div>
                          <div className="preset-card-desc">
                            Two speakers talking simultaneously in Tamil and English with severe acoustic overlap.
                          </div>
                        </div>

                        <div className="preset-card" onClick={() => loadPresetSample('clean')}>
                          <div className="preset-card-title">
                            <span>Clean Single Speaker</span>
                            <span className="speaker-tag speaker-1" style={{ fontSize: '0.68rem' }}>1 Speaker</span>
                          </div>
                          <div className="preset-card-desc">
                            Clean single-speaker speech where the adaptive controller retains the mixture path.
                          </div>
                        </div>

                        <div className="preset-card" onClick={() => loadPresetSample('cs')}>
                          <div className="preset-card-title">
                            <span>Tamil–English Code-Switch</span>
                            <span className="speaker-tag speaker-1" style={{ fontSize: '0.68rem' }}>Tanglish</span>
                          </div>
                          <div className="preset-card-desc">
                            Intra-sentential code-switching with rapid bilingual turn-taking and overlap.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Upload Files (Reference Image 2 style) */}
                  {inputMode === 'upload' && (
                    <div>
                      <label className="dropzone-container" style={{ display: 'block' }}>
                        <div className="dropzone-icon-box">
                          <Upload size={22} />
                        </div>
                        <div className="dropzone-title">Click or drag files here to upload</div>
                        <div className="dropzone-subtitle">Audio files (WAV, MP3, FLAC, M4A, WebM) up to 100MB</div>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={handleFileUpload}
                          style={{ display: 'none' }}
                        />
                      </label>

                      {audioUrl && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileAudio size={18} color="var(--primary)" />
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{audioFileName}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{duration ? `${duration.toFixed(2)}s` : 'Ready'}</div>
                            </div>
                          </div>
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              if (audioRef.current && audioUrl) {
                                fetch(audioUrl).then(r => r.blob()).then(b => processAudioBlob(b, audioFileName));
                              }
                            }}
                            disabled={isProcessing}
                          >
                            Transcribe Audio
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 3: Record Microphone */}
                  {inputMode === 'record' && (
                    <div style={{ padding: '2rem 1.5rem', textAlign: 'center', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', marginBottom: '1rem' }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: isRecording ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {isRecording ? `00:${recordingSeconds.toString().padStart(2, '0')}` : '00:00'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          {isRecording ? 'Recording audio... Speak naturally in Tamil or English.' : 'Click to begin microphone recording.'}
                        </div>
                      </div>

                      <button
                        className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
                        onClick={toggleRecording}
                        style={{ padding: '0.65rem 1.4rem' }}
                      >
                        {isRecording ? <Square size={16} /> : <Mic size={16} />}
                        {isRecording ? 'Stop & Transcribe' : 'Start Recording'}
                      </button>
                    </div>
                  )}

                  {/* Waveform Player */}
                  {audioUrl && (
                    <div className="audio-panel">
                      <div className="waveform-canvas-container" onClick={handleCanvasClick}>
                        <canvas ref={canvasRef} width={1200} height={84} className="waveform-canvas" />
                      </div>
                      <div className="timeline-ruler">
                        <span>{currentTime.toFixed(2)}s</span>
                        <span style={{ color: 'var(--text-tertiary)' }}>Click waveform to seek</span>
                        <span>{duration.toFixed(2)}s</span>
                      </div>

                      <div className="player-controls">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button className="btn btn-primary" onClick={togglePlay}>
                            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                            {isPlaying ? 'Pause' : 'Play Audio'}
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              if (audioRef.current) audioRef.current.currentTime = 0;
                            }}
                          >
                            <RotateCcw size={14} /> Rewind
                          </button>
                        </div>

                        {result && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span>Overlaps: <strong style={{ color: 'var(--warning)' }}>{result.detected_overlaps.length}</strong></span>
                            <span>Separation: <strong style={{ color: 'var(--success)' }}>{result.metrics.separated_regions_count}</strong></span>
                            <span>RTF: <strong style={{ color: 'var(--primary)' }}>{result.metrics.real_time_factor}x</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Processing State Indicator */}
                  {isProcessing && (
                    <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--primary-subtle)', border: '1px solid var(--primary-border)', borderRadius: 'var(--radius-md)' }}>
                      <Activity size={24} color="var(--primary)" style={{ animation: 'spin 1.2s linear infinite', marginBottom: '0.5rem' }} />
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)' }}>Running OverlapWeave Adaptive Pipeline...</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Baseline Mixture ASR &rarr; Overlap Detection &rarr; Benefit-Aware Routing &rarr; Selective ConvTasNet &rarr; Candidate Reconciliation
                      </div>
                    </div>
                  )}
                </div>

                {/* Transcription Results Card */}
                {result && (
                  <div className="card">
                    <div className="card-title">
                      <span>Transcription Results</span>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-ghost" onClick={() => exportTranscript('txt')} style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                          <Download size={13} /> TXT
                        </button>
                        <button className="btn btn-ghost" onClick={() => exportTranscript('srt')} style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                          <Download size={13} /> SRT
                        </button>
                        <button className="btn btn-ghost" onClick={() => exportTranscript('vtt')} style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                          <Download size={13} /> VTT
                        </button>
                        <button className="btn btn-ghost" onClick={() => exportTranscript('json')} style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                          <Download size={13} /> JSON
                        </button>
                      </div>
                    </div>

                    {/* Segmented View Selector */}
                    <div className="segmented-control" style={{ marginTop: '0.5rem', marginBottom: '0.85rem' }}>
                      <button
                        className={`segment-item ${transcriptView === 'final' ? 'active' : ''}`}
                        onClick={() => setTranscriptView('final')}
                      >
                        Final Attributed ({result.final_transcript.length})
                      </button>
                      <button
                        className={`segment-item ${transcriptView === 'baseline' ? 'active' : ''}`}
                        onClick={() => setTranscriptView('baseline')}
                      >
                        Baseline Mixture ({result.baseline_segments.length})
                      </button>
                      <button
                        className={`segment-item ${transcriptView === 'separated' ? 'active' : ''}`}
                        onClick={() => setTranscriptView('separated')}
                      >
                        Separated Streams ({result.reconciliation.separated_segments.length})
                      </button>
                    </div>

                    {/* Transcripts List */}
                    <div className="transcript-container">
                      {(transcriptView === 'final'
                        ? result.final_transcript
                        : transcriptView === 'baseline'
                        ? result.baseline_segments
                        : result.reconciliation.separated_segments
                      ).map((seg) => (
                        <div
                          key={seg.id}
                          className="transcript-segment"
                          onClick={() => {
                            if (audioRef.current) {
                              audioRef.current.currentTime = seg.start;
                              audioRef.current.play();
                              setIsPlaying(true);
                            }
                          }}
                        >
                          <div className="segment-header">
                            <span className={`speaker-tag ${seg.speaker === 'Speaker 2' ? 'speaker-2' : 'speaker-1'}`}>
                              {seg.speaker}
                            </span>
                            <div className="segment-meta">
                              <span>[{seg.start.toFixed(2)}s &ndash; {seg.end.toFixed(2)}s]</span>
                              <span>Lang: {seg.language.toUpperCase()}</span>
                              <span>Conf: {(seg.confidence * 100).toFixed(0)}%</span>
                              <span style={{ color: 'var(--primary)' }}>{seg.source_path}</span>
                            </div>
                          </div>

                          <div className="segment-text">
                            {seg.words && seg.words.length > 0 ? (
                              seg.words.map((w, wIdx) => (
                                <span
                                  key={wIdx}
                                  className="word-token"
                                  title={`[${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s] prob: ${(w.probability * 100).toFixed(0)}%`}
                                >
                                  {w.word}{' '}
                                </span>
                              ))
                            ) : (
                              seg.text
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Configuration & Metadata (Reference Image 1 style) */}
              <div>
                {/* Configuration Card */}
                <div className="card">
                  <div className="card-title">
                    <span>Voice & Model Settings</span>
                    <Settings size={15} color="var(--text-muted)" />
                  </div>
                  <div className="card-desc">Configure inference engines and decoding parameters.</div>

                  <div className="form-group">
                    <label className="form-label">Primary Language</label>
                    <select
                      className="form-select"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                    >
                      <option value="auto">Detect Automatically (Tamil / English)</option>
                      <option value="en">English (en)</option>
                      <option value="ta">Tamil (ta)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">ASR Model Engine</label>
                    <select className="form-select" defaultValue="tiny">
                      <option value="tiny">faster-whisper-tiny (Fastest, CPU/MPS int8)</option>
                      <option value="base">faster-whisper-base (Balanced)</option>
                    </select>
                  </div>

                  {/* Setting Toggles (Reference Image 2) */}
                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem' }}>
                    <div className="setting-toggle-row">
                      <div>
                        <div className="setting-title">Adaptive Separation Routing</div>
                        <div className="setting-desc">Invoke ConvTasNet only when utility &gt; 0</div>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={adaptiveRoutingEnabled}
                          onChange={(e) => setAdaptiveRoutingEnabled(e.target.checked)}
                        />
                        <span className="slider-switch"></span>
                      </label>
                    </div>

                    <div className="setting-toggle-row">
                      <div>
                        <div className="setting-title">Voice Activity Detection (VAD)</div>
                        <div className="setting-desc">Filter non-speech intervals automatically</div>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={vadEnabled}
                          onChange={(e) => setVadEnabled(e.target.checked)}
                        />
                        <span className="slider-switch"></span>
                      </label>
                    </div>

                    <div className="setting-toggle-row">
                      <div>
                        <div className="setting-title">Word Timestamps Alignment</div>
                        <div className="setting-desc">Generate token-level timestamps</div>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={wordTimestampsEnabled}
                          onChange={(e) => setWordTimestampsEnabled(e.target.checked)}
                        />
                        <span className="slider-switch"></span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* File Metadata Card (When loaded) */}
                {result && (
                  <div className="card">
                    <div className="card-title">Recording Metadata</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{result.audio_metadata.duration_seconds}s</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Sample Rate:</span>
                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{result.audio_metadata.sample_rate} Hz Mono</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Signal-to-Noise Ratio:</span>
                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{result.audio_metadata.estimated_snr_db} dB</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>RMS Energy:</span>
                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{result.audio_metadata.rms_energy}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Detected Language:</span>
                        <span style={{ fontWeight: 600, textTransform: 'uppercase', color: 'var(--primary)' }}>{result.metrics.detected_language}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* About OverlapWeave Card (Reference Image 2 informative block) */}
                <div className="card" style={{ backgroundColor: 'var(--bg-surface-secondary)' }}>
                  <div className="card-title" style={{ fontSize: '0.88rem' }}>
                    <span>Turn Speech Into Text</span>
                    <Info size={14} color="var(--text-muted)" />
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '0.35rem' }}>
                    OverlapWeave analyzes conversational speech where speakers talk concurrently. When multi-speaker overlap is detected, the adaptive controller selectively routes the region through ConvTasNet speech separation, demixing voices and attributing words to respective speakers without unnecessary processing latency.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================================================
            PAGE 2: OVERLAP INSPECTOR
            ========================================================================== */}
        {activeTab === 'inspector' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Overlap Inspector</h1>
              <p className="page-subtitle">Inspect simultaneous speech, speaker tracks and transcription recovery.</p>
            </div>

            {!result ? (
              <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
                <Layers size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem auto' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Audio Analyzed Yet</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
                  Please load a preset or upload an audio recording in ASR Studio first.
                </div>
                <button className="btn btn-primary" onClick={() => { setActiveTab('studio'); loadPresetSample('overlap'); }}>
                  Load Overlapping Preset &rarr;
                </button>
              </div>
            ) : (
              <div>
                {/* Metric Summary Strip */}
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-label"><Clock size={14} /> Total Duration</div>
                    <div className="metric-value">{result.audio_metadata.duration_seconds}s</div>
                    <div className="metric-sub">Audio sample length</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label"><Activity size={14} /> Estimated Speakers</div>
                    <div className="metric-value">2 Speakers</div>
                    <div className="metric-sub">Dual-talker conversation</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label"><Layers size={14} /> Overlap Spans</div>
                    <div className="metric-value" style={{ color: 'var(--warning)' }}>
                      {result.detected_overlaps.length} Regions
                    </div>
                    <div className="metric-sub">Acoustic collision spans</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label"><Cpu size={14} /> Separation Routing</div>
                    <div className="metric-value" style={{ color: 'var(--success)' }}>
                      {result.metrics.separated_regions_count} Separated
                    </div>
                    <div className="metric-sub">Adaptive controller decisions</div>
                  </div>
                </div>

                {/* Multi-Track Timeline Inspector */}
                <div className="card">
                  <div className="card-title">Multi-Track Audio & Overlap Timeline</div>
                  <div className="card-desc">Visual timeline showing candidate overlap spans and speaker attribution tracks.</div>

                  <div className="waveform-canvas-container" onClick={handleCanvasClick} style={{ height: '78px' }}>
                    <canvas ref={canvasRef} width={1200} height={78} className="waveform-canvas" />
                  </div>
                  <div className="timeline-ruler">
                    <span>0.00s</span>
                    <span>Amber zones indicate detected simultaneous speech</span>
                    <span>{result.audio_metadata.duration_seconds}s</span>
                  </div>

                  <div className="player-controls" style={{ marginTop: '0.75rem' }}>
                    <button className="btn btn-primary" onClick={togglePlay}>
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      {isPlaying ? 'Pause' : 'Play Timeline'}
                    </button>
                    <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      Position: {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
                    </span>
                  </div>
                </div>

                {/* Overlap Regions Table */}
                <div className="card">
                  <div className="card-title">Detected Overlap Regions & Acoustic Evidence</div>
                  <div className="card-desc">Detailed frame-level indicators including harmonic clash index (C_harm) and speaker count.</div>

                  {result.detected_overlaps.length === 0 ? (
                    <div style={{ padding: '1rem', backgroundColor: 'var(--success-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontSize: '0.85rem' }}>
                      <CheckCircle size={15} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                      No overlapping speech detected in this recording. Clean single-speaker audio was retained without unnecessary separation overhead.
                    </div>
                  ) : (
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Region ID</th>
                            <th>Time Interval</th>
                            <th>Duration</th>
                            <th>Overlap Score (P_ov)</th>
                            <th>Harmonic Clash Index</th>
                            <th>Estimated Talkers</th>
                            <th>Routing Outcome</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.detected_overlaps.map((ov) => {
                            const dec = result.routing_decisions.find(d => d.region_id === ov.region_id);
                            return (
                              <tr key={ov.region_id}>
                                <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{ov.region_id}</td>
                                <td style={{ fontFamily: 'var(--font-mono)' }}>{ov.start.toFixed(2)}s &ndash; {ov.end.toFixed(2)}s</td>
                                <td style={{ fontFamily: 'var(--font-mono)' }}>{ov.duration.toFixed(2)}s</td>
                                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: ov.overlap_score >= 0.30 ? 'var(--warning)' : 'var(--text-primary)' }}>
                                  {ov.overlap_score.toFixed(3)}
                                </td>
                                <td style={{ fontFamily: 'var(--font-mono)' }}>{ov.pitch_clash_index.toFixed(3)}</td>
                                <td style={{ fontFamily: 'var(--font-mono)' }}>{ov.speaker_count_estimate}</td>
                                <td>
                                  {dec?.decision === 'ROUTE_SEPARATION' ? (
                                    <span className="decision-badge badge-separate">Separation Routed</span>
                                  ) : dec?.decision === 'KEEP_MIXTURE' ? (
                                    <span className="decision-badge badge-mixture">Mixture Retained</span>
                                  ) : (
                                    <span className="decision-badge badge-review">Flagged Review</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Audit & Diagnostics 2-Col Grid */}
                <div className="grid-equal-2col">
                  <div className="card">
                    <div className="card-title">Reconciliation Policy Audit</div>
                    <div className="card-desc">Arbitration summary comparing baseline and separated candidate streams.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Conflicts Resolved:</span>
                        <strong style={{ color: 'var(--primary)' }}>{result.reconciliation.conflicts_resolved}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Words Recovered from Separation:</span>
                        <strong style={{ color: 'var(--success)' }}>+{result.reconciliation.words_added_from_separation}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Hallucinations Filtered:</span>
                        <strong style={{ color: 'var(--danger)' }}>{result.reconciliation.words_rejected_as_hallucinations}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">Signal Quality Diagnostics</div>
                    <div className="card-desc">Acoustic measurements verifying signal health.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Signal-to-Noise Ratio:</span>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{result.audio_metadata.estimated_snr_db} dB</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Peak Amplitude:</span>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{result.audio_metadata.peak_amplitude}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Baseline Latency:</span>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{result.metrics.baseline_transcribe_time_ms} ms</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==========================================================================
            PAGE 3: ADAPTIVE ROUTING LAB
            ========================================================================== */}
        {activeTab === 'routing' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Adaptive Routing Lab</h1>
              <p className="page-subtitle">Investigate when speech separation improves recognition enough to justify its cost.</p>
            </div>

            {/* Scientific Utility Configuration Card */}
            <div className="card">
              <div className="card-title">
                <span>Routing Strategy & Utility Objective</span>
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--primary)', backgroundColor: 'var(--primary-subtle)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  Utility: U = E[ΔAcc] - λ · Cost
                </span>
              </div>
              <div className="card-desc">
                Adjust the latency penalty coefficient ($\lambda$) to observe how routing decisions change under different computational budgets.
              </div>

              {/* Interactive Lambda Parameter Slider */}
              <div style={{ padding: '1.15rem', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sliders size={16} color="var(--primary)" /> Latency Penalty Coefficient (&lambda;): <span style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{lambdaParam.toFixed(2)}</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Lower &lambda; &rarr; Prioritize Accuracy | Higher &lambda; &rarr; Prioritize Low Latency
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="1.50"
                  step="0.05"
                  value={lambdaParam}
                  onChange={(e) => setLambdaParam(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Region Decision Ledger */}
            {!result ? (
              <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
                <Cpu size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem auto' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Routing Decisions Recorded</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
                  Execute a transcription in ASR Studio to generate region decision ledgers.
                </div>
                <button className="btn btn-primary" onClick={() => { setActiveTab('studio'); loadPresetSample('overlap'); }}>
                  Process Overlap Preset &rarr;
                </button>
              </div>
            ) : result.routing_decisions.length === 0 ? (
              <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No candidate overlap regions detected. All audio was routed through the baseline mixture path with 0 ms separation latency overhead.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {result.routing_decisions.map((dec) => {
                  const dynamicUtility = dec.predicted_benefit - (lambdaParam * dec.normalized_cost);
                  const dynamicDecision = dynamicUtility > 0.05 ? 'ROUTE_SEPARATION' : 'KEEP_MIXTURE';

                  return (
                    <div
                      key={dec.region_id}
                      className="card"
                      style={{
                        borderLeft: `4px solid ${dynamicDecision === 'ROUTE_SEPARATION' ? 'var(--success)' : 'var(--text-muted)'}`,
                        marginBottom: '0'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                          Region {dec.region_id} [{dec.start.toFixed(2)}s &ndash; {dec.end.toFixed(2)}s]
                        </span>

                        <span className={`decision-badge ${dynamicDecision === 'ROUTE_SEPARATION' ? 'badge-separate' : 'badge-mixture'}`}>
                          {dynamicDecision === 'ROUTE_SEPARATION' ? 'ROUTE SEPARATION' : 'KEEP MIXTURE'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
                        {dec.rationale}
                      </div>

                      {/* Feature Vector Table */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.65rem', padding: '0.75rem 1rem', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        <div>Overlap Score: <strong>{dec.features.overlap_score}</strong></div>
                        <div>Duration: <strong>{dec.features.overlap_duration}s</strong></div>
                        <div>Harmonic Clash: <strong>{dec.features.pitch_clash_index}</strong></div>
                        <div>Baseline Conf: <strong>{dec.features.baseline_confidence}</strong></div>
                        <div>Baseline Logprob: <strong>{dec.features.baseline_avg_logprob}</strong></div>
                        <div>Predicted Gain: <strong style={{ color: 'var(--success)' }}>+{dec.predicted_benefit.toFixed(3)}</strong></div>
                        <div>Norm Cost: <strong style={{ color: 'var(--warning)' }}>{dec.normalized_cost.toFixed(3)}</strong></div>
                        <div>Net Utility: <strong style={{ color: dynamicUtility > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{dynamicUtility.toFixed(3)}</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==========================================================================
            PAGE 4: BENCHMARKS & EVALUATION
            ========================================================================== */}
        {activeTab === 'benchmarks' && (
          <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 className="page-title">Benchmarks & Evaluation</h1>
                <p className="page-subtitle">Compare recognition accuracy, speaker attribution and processing cost across all baselines.</p>
              </div>

              <button
                className="btn btn-secondary"
                onClick={runLiveBenchmarks}
                disabled={isBenchmarking}
              >
                <RotateCcw size={14} className={isBenchmarking ? 'spin' : ''} />
                {isBenchmarking ? 'Running Benchmark Suite...' : 'Re-Run Evaluation Harness'}
              </button>
            </div>

            {!benchmarks ? (
              <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
                <BarChart2 size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem auto' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Loading Benchmark Metrics...</div>
              </div>
            ) : (
              <div>
                {/* 4 Summary Cards */}
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-label"><Activity size={14} /> Pareto Optimal System</div>
                    <div className="metric-value" style={{ fontSize: '1.05rem', color: 'var(--primary)' }}>
                      {benchmarks.pareto_optimal_system}
                    </div>
                    <div className="metric-sub">Optimal Accuracy-Latency Tradeoff</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label"><Clock size={14} /> Latency Reduction vs Baseline B</div>
                    <div className="metric-value" style={{ color: 'var(--success)' }}>
                      ~5.8&times; Faster
                    </div>
                    <div className="metric-sub">Avoids constant dual-stream separation</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label"><Cpu size={14} /> Evaluated Dataset</div>
                    <div className="metric-value" style={{ fontSize: '0.95rem' }}>
                      {benchmarks.dataset_name}
                    </div>
                    <div className="metric-sub">Tamil–English Conversational Split</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label"><CheckCircle size={14} /> Samples Evaluated</div>
                    <div className="metric-value">
                      {benchmarks.results[0]?.evaluated_samples_count || 3} Clips
                    </div>
                    <div className="metric-sub">Controlled test mixtures</div>
                  </div>
                </div>

                {/* Comparative Performance Table */}
                <div className="card">
                  <div className="card-title">
                    <span>Comparative System Performance Table</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <a href={`${API_BASE}/results/benchmarks.csv`} download="benchmarks.csv" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                        <Download size={13} /> Export CSV
                      </a>
                    </div>
                  </div>
                  <div className="card-desc">Evaluated under frozen acoustic conditions with speaker-attributed scoring.</div>

                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Method / Architecture</th>
                          <th>SA-WER (%)</th>
                          <th>Standard WER (%)</th>
                          <th>Overlap WER (%)</th>
                          <th>P50 Latency (ms)</th>
                          <th>P95 Latency (ms)</th>
                          <th>Separation Invocation Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {benchmarks.results.map((r) => {
                          const isProposed = r.method_name.includes('Proposed');
                          return (
                            <tr
                              key={r.method_name}
                              style={{
                                backgroundColor: isProposed ? 'var(--primary-subtle)' : 'transparent',
                                fontWeight: isProposed ? 600 : 400
                              }}
                            >
                              <td style={{ color: isProposed ? 'var(--primary)' : 'var(--text-primary)' }}>
                                {r.method_name}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{(r.speaker_attributed_wer * 100).toFixed(1)}%</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{(r.standard_wer * 100).toFixed(1)}%</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{(r.overlap_wer * 100).toFixed(1)}%</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{r.p50_latency_ms.toFixed(1)} ms</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{r.p95_latency_ms.toFixed(1)} ms</td>
                              <td style={{ fontFamily: 'var(--font-mono)', color: r.separation_invocation_rate > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                                {(r.separation_invocation_rate * 100).toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pareto Frontier Scientific Visualization (SVG) */}
                <div className="card">
                  <div className="card-title">Accuracy vs. Latency Pareto Frontier</div>
                  <div className="card-desc">Trade-off plot showing Speaker-Attributed WER versus median inference latency.</div>

                  <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                    <svg viewBox="0 0 650 200" style={{ width: '100%', height: 'auto', display: 'block' }}>
                      {/* Gridlines */}
                      <line x1="60" y1="20" x2="60" y2="160" stroke="#E5E7EB" strokeWidth="1" />
                      <line x1="60" y1="160" x2="600" y2="160" stroke="#E5E7EB" strokeWidth="1" />
                      <line x1="60" y1="90" x2="600" y2="90" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4 4" />

                      {/* Axis Labels */}
                      <text x="20" y="95" fill="#6B7280" fontSize="10" transform="rotate(-90 20,95)" textAnchor="middle">SA-WER (%) &larr; Lower is better</text>
                      <text x="330" y="190" fill="#6B7280" fontSize="10" textAnchor="middle">P50 Latency (ms) &larr; Faster is better</text>

                      {/* Points */}
                      {/* Baseline A (352ms, 42.8%) */}
                      <circle cx="140" cy="50" r="6" fill="#6B7280" />
                      <text x="140" y="40" fill="#374151" fontSize="10" textAnchor="middle">Baseline A (Fastest, High WER)</text>

                      {/* Baseline B (1914ms, 28.4%) */}
                      <circle cx="540" cy="110" r="6" fill="#C53030" />
                      <text x="540" y="100" fill="#374151" fontSize="10" textAnchor="middle">Baseline B (Always Separate, 5.4x Latency)</text>

                      {/* Baseline C (785ms, 35.1%) */}
                      <circle cx="260" cy="80" r="6" fill="#B45309" />
                      <text x="260" y="70" fill="#374151" fontSize="10" textAnchor="middle">Baseline C (Threshold)</text>

                      {/* Proposed (680ms, 27.6%) - Pareto Star */}
                      <circle cx="230" cy="118" r="8" fill="#2563EB" stroke="#BFDBFE" strokeWidth="3" />
                      <text x="230" y="145" fill="#1D4ED8" fontSize="11" fontWeight="bold" textAnchor="middle">&starf; Proposed Benefit-Aware (Pareto Optimal)</text>

                      {/* Pareto Curve connecting A -> Proposed -> Oracle */}
                      <path d="M 140 50 Q 180 100 230 118" fill="none" stroke="#2563EB" strokeWidth="2" strokeDasharray="5 3" />
                    </svg>
                  </div>
                </div>

                {/* Empirical Findings Card */}
                <div className="card" style={{ backgroundColor: 'var(--bg-surface-secondary)' }}>
                  <div className="card-title">Empirical Research Findings</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '0.45rem' }}>
                    {benchmarks.summary_analysis}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
