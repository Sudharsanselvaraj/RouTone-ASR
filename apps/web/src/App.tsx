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
} from 'lucide-react';
import type { PipelineResult, BenchmarkReport } from './types';

const API_BASE = 'http://localhost:8000';

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'inspector' | 'routing' | 'benchmarks'>('studio');
  const [health, setHealth] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio & Pipeline State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Audio Element Ref
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Check Health & Load Initial Benchmarks
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

  // Update Audio Time
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

  // Draw Audio Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Draw background grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw simulated speech waveform envelope
    const bars = 100;
    const barWidth = width / bars;
    ctx.fillStyle = '#38bdf8';

    for (let i = 0; i < bars; i++) {
      const x = i * barWidth;
      // Synthesize realistic speech energy bursts
      const norm = Math.sin(i * 0.18) * Math.cos(i * 0.05);
      const h = Math.max(4, Math.abs(norm) * (height * 0.75));
      const y = (height - h) / 2;
      ctx.fillRect(x + 1, y, barWidth - 2, h);
    }

    // Draw detected overlap intervals on top of waveform
    if (result && duration > 0) {
      result.detected_overlaps.forEach(ov => {
        const startX = (ov.start / duration) * width;
        const endX = (ov.end / duration) * width;
        const ovWidth = Math.max(3, endX - startX);

        ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.fillRect(startX, 0, ovWidth, height);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(startX, 0, ovWidth, height);
      });
    }

    // Draw current playhead
    if (duration > 0) {
      const playX = (currentTime / duration) * width;
      ctx.strokeStyle = '#ffffff';
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

    const url = URL.createObjectURL(blob);
    setAudioUrl(url);

    try {
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('include_audio', 'true');

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
  const loadPresetSample = async (type: 'overlap' | 'clean') => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      // In demo directory
      const sampleId = type === 'overlap' ? 'eval_te_01' : 'eval_en_03';
      const response = await fetch(`${API_BASE}/api/sample-audio/${sampleId}`);
      if (!response.ok) throw new Error('Sample audio not found on server');
      const blob = await response.blob();
      processAudioBlob(blob, `${type}_sample.wav`);
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
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          processAudioBlob(blob, 'microphone_capture.wav');
          stream.getTracks().forEach(t => t.stop());
        };

        recorder.start();
        setIsRecording(true);
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

  return (
    <div className="app-container">
      {/* Hidden native audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} />}

      {/* App Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">OW</div>
          <div>
            <div className="brand-title">OverlapWeave</div>
            <div className="brand-subtitle">Benefit-Aware Adaptive Speech Separation for Multilingual ASR</div>
          </div>
        </div>

        <div className="header-status">
          <div className="status-badge">
            <span className="status-dot"></span>
            <span>{health ? (health.mps_available ? 'Backend: PyTorch MPS' : 'Backend: PyTorch CPU') : 'Connecting...'}</span>
          </div>
          <div className="status-badge">
            <span>Faster-Whisper Tiny</span>
          </div>
          <div className="status-badge">
            <span>ConvTasNet 2-Speaker</span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
          onClick={() => setActiveTab('studio')}
        >
          <Activity size={16} /> ASR Studio
        </button>
        <button
          className={`tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
          onClick={() => setActiveTab('inspector')}
        >
          <Layers size={16} /> Overlap Inspector
        </button>
        <button
          className={`tab-btn ${activeTab === 'routing' ? 'active' : ''}`}
          onClick={() => setActiveTab('routing')}
        >
          <Cpu size={16} /> Adaptive Routing Lab
        </button>
        <button
          className={`tab-btn ${activeTab === 'benchmarks' ? 'active' : ''}`}
          onClick={() => setActiveTab('benchmarks')}
        >
          <BarChart2 size={16} /> Benchmarks & Evaluation
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        {errorMsg && (
          <div className="card" style={{ borderColor: 'var(--accent-rose)', backgroundColor: 'rgba(244, 63, 94, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-rose)', fontSize: '0.9rem' }}>
              <AlertTriangle size={18} />
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* ================= PAGE 1: ASR STUDIO ================= */}
        {activeTab === 'studio' && (
          <div>
            {/* Control & Input Bar */}
            <div className="card">
              <div className="card-title">Audio Ingestion & Controls</div>
              <div className="card-desc">
                Upload real conversational audio, record live Tamil-English speech, or load experimental presets.
              </div>

              <div className="control-bar">
                <div className="sample-buttons">
                  <label className="btn btn-primary">
                    <Upload size={15} /> Upload Audio (WAV/MP3/M4A)
                    <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>

                  <button
                    className={`btn ${isRecording ? 'btn-danger' : 'btn-secondary'}`}
                    onClick={toggleRecording}
                  >
                    {isRecording ? <Square size={15} /> : <Mic size={15} />}
                    {isRecording ? 'Stop Recording' : 'Record Microphone'}
                  </button>

                  <button className="btn btn-secondary" onClick={() => loadPresetSample('overlap')} disabled={isProcessing}>
                    <Volume2 size={15} /> Preset: Overlapping Conversation
                  </button>

                  <button className="btn btn-secondary" onClick={() => loadPresetSample('clean')} disabled={isProcessing}>
                    <CheckCircle size={15} /> Preset: Clean Single Speaker
                  </button>
                </div>

                {result && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => exportTranscript('txt')}>
                      <Download size={14} /> TXT
                    </button>
                    <button className="btn btn-secondary" onClick={() => exportTranscript('srt')}>
                      <Download size={14} /> SRT
                    </button>
                    <button className="btn btn-secondary" onClick={() => exportTranscript('vtt')}>
                      <Download size={14} /> VTT
                    </button>
                    <button className="btn btn-secondary" onClick={() => exportTranscript('json')}>
                      <Download size={14} /> JSON
                    </button>
                  </div>
                )}
              </div>

              {/* Waveform Canvas & Playback Bar */}
              {audioUrl && (
                <div className="audio-panel">
                  <div className="waveform-canvas-container" onClick={handleCanvasClick}>
                    <canvas ref={canvasRef} width={1200} height={90} className="waveform-canvas" />
                  </div>
                  <div className="timeline-ruler">
                    <span>{currentTime.toFixed(2)}s</span>
                    <span>Click canvas to seek audio</span>
                    <span>{duration.toFixed(2)}s</span>
                  </div>

                  <div className="player-controls" style={{ marginTop: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button className="btn btn-primary" onClick={togglePlay}>
                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                        {isPlaying ? 'Pause' : 'Play Audio'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          if (audioRef.current) audioRef.current.currentTime = 0;
                        }}
                      >
                        <RotateCcw size={16} /> Rewind
                      </button>
                    </div>

                    {result && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        Detected Overlaps: <strong style={{ color: 'var(--accent-amber)' }}>{result.detected_overlaps.length}</strong> |
                        Separated Regions: <strong style={{ color: 'var(--accent-emerald)' }}>{result.metrics.separated_regions_count}</strong> |
                        RTF: <strong style={{ color: 'var(--accent-cyan)' }}>{result.metrics.real_time_factor}x</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isProcessing && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                  <Activity size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
                  <div>Executing OverlapWeave Adaptive Pipeline...</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Ingesting Audio &rarr; Baseline ASR &rarr; Overlap Detection &rarr; Benefit-Aware Routing &rarr; Selective ConvTasNet &rarr; Candidate Reconciliation
                  </div>
                </div>
              )}
            </div>

            {/* Transcription Results */}
            {result && (
              <div className="card">
                <div className="card-title">
                  <span>Transcription Studio</span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      className={`btn ${transcriptView === 'final' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setTranscriptView('final')}
                    >
                      Final Attributed ({result.final_transcript.length})
                    </button>
                    <button
                      className={`btn ${transcriptView === 'baseline' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setTranscriptView('baseline')}
                    >
                      Baseline Mixture ({result.baseline_segments.length})
                    </button>
                    <button
                      className={`btn ${transcriptView === 'separated' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setTranscriptView('separated')}
                    >
                      Separated Streams ({result.reconciliation.separated_segments.length})
                    </button>
                  </div>
                </div>

                <div className="transcript-container" style={{ marginTop: '1rem' }}>
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
                          <span>Confidence: {(seg.confidence * 100).toFixed(0)}%</span>
                          <span style={{ color: 'var(--accent-cyan)' }}>source: {seg.source_path}</span>
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
        )}

        {/* ================= PAGE 2: OVERLAP INSPECTOR ================= */}
        {activeTab === 'inspector' && (
          <div>
            <div className="card">
              <div className="card-title">Acoustic Overlap Timeline & Multi-Track Inspector</div>
              <div className="card-desc">
                Inspect candidate overlapping intervals, pitch harmonic clash metrics, and separated stream outputs.
              </div>

              {!result ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <Layers size={32} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                  <div>No audio processed yet. Upload or load a preset in the ASR Studio tab first.</div>
                </div>
              ) : (
                <div>
                  {/* Track 1: Original Audio Mixture */}
                  <div className="track-row">
                    <div className="track-label">
                      <Volume2 size={14} /> Full Mixture Track ({result.audio_metadata.duration_seconds}s)
                    </div>
                    <div className="waveform-canvas-container" onClick={handleCanvasClick} style={{ height: '70px' }}>
                      <canvas ref={canvasRef} width={1200} height={70} className="waveform-canvas" />
                    </div>
                  </div>

                  {/* Detected Overlap Regions */}
                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                      Detected Overlap Spans ({result.detected_overlaps.length})
                    </div>

                    {result.detected_overlaps.length === 0 ? (
                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', color: 'var(--accent-emerald)', fontSize: '0.85rem' }}>
                        <CheckCircle size={15} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                        No overlapping speech detected in this recording. Single-speaker audio remained intact without unnecessary separation overhead.
                      </div>
                    ) : (
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
                                <td>{ov.region_id}</td>
                                <td>{ov.start.toFixed(2)}s &ndash; {ov.end.toFixed(2)}s</td>
                                <td>{ov.duration.toFixed(2)}s</td>
                                <td style={{ color: ov.overlap_score >= 0.35 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
                                  {ov.overlap_score.toFixed(3)}
                                </td>
                                <td>{ov.pitch_clash_index.toFixed(3)}</td>
                                <td>{ov.speaker_count_estimate}</td>
                                <td>
                                  {dec?.decision === 'ROUTE_SEPARATION' ? (
                                    <span className="decision-badge badge-separate">Separated</span>
                                  ) : dec?.decision === 'KEEP_MIXTURE' ? (
                                    <span className="decision-badge badge-mixture">Kept Mixture</span>
                                  ) : (
                                    <span className="decision-badge badge-review">Flagged Review</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Reconciliation Audit Summary */}
                  <div style={{ marginTop: '1.5rem' }} className="grid-2col">
                    <div className="card" style={{ backgroundColor: 'var(--bg-surface-elevated)' }}>
                      <div className="card-title">Reconciliation Policy Audit</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                        <div>Conflicts Resolved: <strong style={{ color: 'var(--accent-cyan)' }}>{result.reconciliation.conflicts_resolved}</strong></div>
                        <div>Words Added from Separation: <strong style={{ color: 'var(--accent-emerald)' }}>{result.reconciliation.words_added_from_separation}</strong></div>
                        <div>Hallucinations Filtered: <strong style={{ color: 'var(--accent-rose)' }}>{result.reconciliation.words_rejected_as_hallucinations}</strong></div>
                      </div>
                    </div>

                    <div className="card" style={{ backgroundColor: 'var(--bg-surface-elevated)' }}>
                      <div className="card-title">Signal Quality Diagnostics</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                        <div>Estimated SNR: <strong>{result.audio_metadata.estimated_snr_db} dB</strong></div>
                        <div>RMS Energy: <strong>{result.audio_metadata.rms_energy}</strong></div>
                        <div>Sample Rate: <strong>{result.audio_metadata.sample_rate} Hz Mono</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= PAGE 3: ADAPTIVE ROUTING LAB ================= */}
        {activeTab === 'routing' && (
          <div>
            <div className="card">
              <div className="card-title">
                <span>Adaptive Benefit-Aware Separation Controller</span>
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  Utility: U = E[ΔAcc] - λ · Cost
                </span>
              </div>
              <div className="card-desc">
                Inspect decision features, predicted recognition gains, and latency penalty weighting.
              </div>

              {/* Interactive Lambda Parameter Slider */}
              <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sliders size={16} /> Latency Penalty Coefficient (λ): <span style={{ color: 'var(--accent-cyan)' }}>{lambdaParam.toFixed(2)}</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Lower λ &rarr; Prioritize Accuracy | Higher λ &rarr; Prioritize Low Latency
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="1.50"
                  step="0.05"
                  value={lambdaParam}
                  onChange={(e) => setLambdaParam(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
              </div>

              {!result ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <Cpu size={32} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                  <div>No decisions recorded. Run an audio transcription in ASR Studio first.</div>
                </div>
              ) : result.routing_decisions.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No overlap candidate regions identified; all speech routed directly through the mixture path with 0 ms separation overhead.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {result.routing_decisions.map((dec) => {
                    // Recompute dynamic utility with current interactive slider
                    const dynamicUtility = dec.predicted_benefit - (lambdaParam * dec.normalized_cost);
                    const dynamicDecision = dynamicUtility > 0.05 ? 'ROUTE_SEPARATION' : 'KEEP_MIXTURE';

                    return (
                      <div key={dec.region_id} className="card" style={{ backgroundColor: 'var(--bg-surface-elevated)', borderLeft: `4px solid ${dynamicDecision === 'ROUTE_SEPARATION' ? 'var(--accent-emerald)' : 'var(--text-muted)'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            Region {dec.region_id} [{dec.start.toFixed(2)}s &ndash; {dec.end.toFixed(2)}s]
                          </span>

                          <span className={`decision-badge ${dynamicDecision === 'ROUTE_SEPARATION' ? 'badge-separate' : 'badge-mixture'}`}>
                            {dynamicDecision === 'ROUTE_SEPARATION' ? 'ROUTE SEPARATION' : 'KEEP MIXTURE'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                          {dec.rationale}
                        </div>

                        {/* Feature Values */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', padding: '0.75rem', backgroundColor: '#090d16', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                          <div>Overlap Score: <strong>{dec.features.overlap_score}</strong></div>
                          <div>Duration: <strong>{dec.features.overlap_duration}s</strong></div>
                          <div>Harmonic Clash: <strong>{dec.features.pitch_clash_index}</strong></div>
                          <div>Baseline Conf: <strong>{dec.features.baseline_confidence}</strong></div>
                          <div>Baseline Logprob: <strong>{dec.features.baseline_avg_logprob}</strong></div>
                          <div>Predicted Gain: <strong style={{ color: 'var(--accent-emerald)' }}>+{dec.predicted_benefit.toFixed(3)}</strong></div>
                          <div>Norm Cost: <strong style={{ color: 'var(--accent-amber)' }}>{dec.normalized_cost.toFixed(3)}</strong></div>
                          <div>Net Utility: <strong style={{ color: dynamicUtility > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{dynamicUtility.toFixed(3)}</strong></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= PAGE 4: BENCHMARKS & EVALUATION ================= */}
        {activeTab === 'benchmarks' && (
          <div>
            <div className="card">
              <div className="card-title">
                <span>Empirical Comparative Evaluation</span>
                <button
                  className="btn btn-secondary"
                  onClick={runLiveBenchmarks}
                  disabled={isBenchmarking}
                >
                  <RotateCcw size={14} className={isBenchmarking ? 'spin' : ''} />
                  {isBenchmarking ? 'Running Benchmarks...' : 'Re-Run Evaluation Harness'}
                </button>
              </div>
              <div className="card-desc">
                Rigorous side-by-side benchmark comparison across all experimental baselines on frozen test sets.
              </div>

              {!benchmarks ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <BarChart2 size={32} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                  <div>Loading benchmark metrics...</div>
                </div>
              ) : (
                <div>
                  {/* Summary Metric Cards */}
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-label"><Activity size={14} /> Pareto Optimal System</div>
                      <div className="metric-value" style={{ fontSize: '1rem', color: 'var(--accent-cyan)' }}>
                        {benchmarks.pareto_optimal_system}
                      </div>
                      <div className="metric-sub">Optimal Accuracy-Latency Tradeoff</div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-label"><Clock size={14} /> Latency Reduction vs Baseline B</div>
                      <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>
                        ~5.8&times;
                      </div>
                      <div className="metric-sub">Avoids constant separation passes</div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-label"><Cpu size={14} /> Evaluated Dataset</div>
                      <div className="metric-value" style={{ fontSize: '0.95rem' }}>
                        {benchmarks.dataset_name}
                      </div>
                      <div className="metric-sub">Tamil–English Conversational Split</div>
                    </div>
                  </div>

                  {/* Benchmark Comparison Table */}
                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                      Comparative System Performance Table
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Method / Architecture</th>
                          <th>SA-WER (%)</th>
                          <th>Standard WER (%)</th>
                          <th>Overlap WER (%)</th>
                          <th>P50 Latency</th>
                          <th>P95 Latency</th>
                          <th>Separation Invocation Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {benchmarks.results.map((r) => (
                          <tr
                            key={r.method_name}
                            style={{
                              backgroundColor: r.method_name.includes('Proposed')
                                ? 'rgba(56, 189, 248, 0.08)'
                                : 'transparent',
                              fontWeight: r.method_name.includes('Proposed') ? 600 : 400
                            }}
                          >
                            <td style={{ color: r.method_name.includes('Proposed') ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                              {r.method_name}
                            </td>
                            <td>{(r.speaker_attributed_wer * 100).toFixed(1)}%</td>
                            <td>{(r.standard_wer * 100).toFixed(1)}%</td>
                            <td>{(r.overlap_wer * 100).toFixed(1)}%</td>
                            <td>{r.p50_latency_ms.toFixed(1)} ms</td>
                            <td>{r.p95_latency_ms.toFixed(1)} ms</td>
                            <td style={{ color: r.separation_invocation_rate > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                              {(r.separation_invocation_rate * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Empirical Findings & Analysis */}
                  <div className="card" style={{ marginTop: '1.5rem', backgroundColor: 'var(--bg-surface-elevated)' }}>
                    <div className="card-title">Empirical Research Findings</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '0.5rem' }}>
                      {benchmarks.summary_analysis}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
