import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../api';
import { computePeaks, decodeAudio, isRecordingSupported, pickRecorderMime, readWavSampleRate } from '../lib/audio';
import type { BenchmarkHistoryItem, BenchmarkReport, DemoInfo, HealthInfo, PipelineResult, RunSummary } from '../types';
import {
  DEFAULT_SETTINGS,
  WorkbenchContext,
  effectiveStrategy,
} from './store';
import type { Backend, MicState, Operation, Playback, Recording, RecordingSource, Settings, View, Workbench } from './store';

const SETTINGS_KEY = 'routone.settings.v1';
const PEAK_COLUMNS = 4000;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable: defaults */
  }
  return DEFAULT_SETTINGS;
}

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (['overview', 'studio', 'inspector', 'routing', 'benchmarks'] as const).find((v) => v === h) ?? 'landing';
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
}

function isInteractiveTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return /^(BUTTON|A|SUMMARY)$/.test(el.tagName) || el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'switch';
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  /* ------------------------------ navigation ------------------------------ */
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((v: View) => {
    window.location.hash = v === 'landing' ? '' : `/${v}`;
    window.scrollTo({ top: 0 });
  }, []);

  /* ------------------------------ health ------------------------------ */
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [backend, setBackend] = useState<Backend>('connecting');
  const refreshHealth = useCallback(() => {
    api
      .health()
      .then((h) => {
        setHealth(h);
        setBackend('online');
      })
      .catch(() => {
        setHealth(null);
        setBackend('offline');
      });
  }, []);
  useEffect(() => {
    refreshHealth();
    const t = setInterval(refreshHealth, 20000);
    return () => clearInterval(t);
  }, [refreshHealth]);

  /* ------------------------------ settings ------------------------------ */
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* per-viewer convenience only */
      }
      return next;
    });
  }, []);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  /* ------------------------------ operation / errors ------------------------------ */
  const [operation, setOperation] = useState<Operation>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  /* ------------------------------ playback ------------------------------ */
  const audio = useMemo(() => {
    const a = new Audio();
    a.preload = 'auto';
    return a;
  }, []);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const rangeEnd = useRef<number | null>(null);

  useEffect(() => {
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onMeta = () => setMediaDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTime = () => setTime(audio.currentTime);
    const onSeek = () => {
      setTime(audio.currentTime);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onPause);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('seeked', onSeek);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onPause);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('seeked', onSeek);
    };
  }, [audio]);

  // Smooth clock + range playback stop while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (rangeEnd.current != null && audio.currentTime >= rangeEnd.current) {
        audio.pause();
        rangeEnd.current = null;
      }
      if (now - last > 66) {
        last = now;
        setTime(audio.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, audio]);

  const seek = useCallback(
    (t: number) => {
      const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
      const clamped = Math.max(0, Math.min(max, t));
      rangeEnd.current = null;
      audio.currentTime = clamped;
      setTime(clamped);
    },
    [audio],
  );
  const toggle = useCallback(() => {
    if (!audio.src) return;
    if (audio.paused) {
      rangeEnd.current = null;
      void audio.play().catch(() => setError('Playback was blocked by the browser. Press play again.'));
    } else audio.pause();
  }, [audio]);
  const restart = useCallback(() => seek(0), [seek]);
  const playRange = useCallback(
    (start: number, end: number) => {
      if (!audio.src) return;
      audio.currentTime = start;
      setTime(start);
      rangeEnd.current = end;
      void audio.play().catch(() => setError('Playback was blocked by the browser. Press play again.'));
    },
    [audio],
  );

  /* ------------------------------ recording ------------------------------ */
  const [recording, setRecording] = useState<Recording | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const recordingRef = useRef<Recording | null>(null);

  const adoptRecording = useCallback(
    async (blob: Blob, name: string, source: RecordingSource, runId?: string): Promise<Recording> => {
      const prev = recordingRef.current;
      audio.pause();
      rangeEnd.current = null;
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.load();
      setTime(0);
      setMediaDuration(0);
      let decoded = null;
      let peaks = null;
      let decodeError: string | null = null;
      try {
        decoded = await decodeAudio(blob);
        peaks = computePeaks(decoded.samples, decoded.sampleRate, PEAK_COLUMNS);
      } catch (e) {
        decodeError = e instanceof Error ? e.message : 'This audio could not be decoded for the waveform.';
      }
      const rec: Recording = {
        id: `${Date.now()}`,
        name,
        source,
        blob,
        url,
        sizeBytes: blob.size,
        decoded,
        peaks,
        decodeError,
        sourceSampleRate: await readWavSampleRate(blob).catch(() => null),
        runId,
      };
      recordingRef.current = rec;
      setRecording(rec);
      setSelectedRegionId(null);
      setSelectedSegmentId(null);
      if (prev) URL.revokeObjectURL(prev.url);
      return rec;
    },
    [audio],
  );

  const runTranscribe = useCallback(
    async (rec: Recording) => {
      const s = settingsRef.current;
      setError(null);
      setResult(null);
      setOperation({ kind: 'transcribing', startedAt: Date.now() });
      try {
        const data = await api.transcribe(rec.blob, rec.name, {
          language: s.language,
          asrModel: s.asrModel,
          vadFilter: s.vadFilter,
          wordTimestamps: s.wordTimestamps,
          routingStrategy: effectiveStrategy(s),
          lambdaParam: s.lambdaParam,
          threshold: s.threshold,
        });
        // Ignore the response if the user switched recordings while it was running.
        if (recordingRef.current?.id === rec.id) setResult(data);
        refreshRunsRef.current();
        refreshHealth();
      } catch (e) {
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Transcription failed.');
      } finally {
        setOperation({ kind: 'idle' });
      }
    },
    [refreshHealth],
  );

  const transcribe = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    await runTranscribe(rec);
  }, [runTranscribe]);

  const [demos, setDemos] = useState<DemoInfo[]>([]);
  const online = backend === 'online';
  useEffect(() => {
    if (online) api.demos().then(setDemos).catch(() => setDemos([]));
  }, [online]);

  const loadDemo = useCallback(
    async (id: string, opts?: { autoTranscribe?: boolean }) => {
      setError(null);
      setResult(null);
      setOperation({ kind: 'loading', label: 'Loading demo audio' });
      try {
        const res = await fetch(api.demoAudioUrl(id));
        if (!res.ok) throw new Error('That demo recording is not available on the server.');
        const blob = await res.blob();
        const info = demos.find((d) => d.id === id);
        const rec = await adoptRecording(blob, info?.filename ?? `${id}.wav`, 'demo');
        setOperation({ kind: 'idle' });
        if (opts?.autoTranscribe) await runTranscribe(rec);
      } catch (e) {
        setOperation({ kind: 'idle' });
        setError(e instanceof TypeError ? 'Cannot reach the Routone backend. Start it with `make server`.' : e instanceof Error ? e.message : 'Could not load the demo.');
      }
    },
    [adoptRecording, demos, runTranscribe],
  );

  const loadFile = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setOperation({ kind: 'loading', label: 'Reading audio' });
      try {
        await adoptRecording(file, file.name, 'upload');
      } finally {
        setOperation({ kind: 'idle' });
      }
    },
    [adoptRecording],
  );

  /* ------------------------------ microphone ------------------------------ */
  const [micRecording, setMicRecording] = useState(false);
  const [micElapsed, setMicElapsed] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const micRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; startedAt: number; stop: () => void } | null>(null);
  const micSupported = isRecordingSupported();

  const startMic = useCallback(async () => {
    if (!micSupported || micRef.current) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access was denied or no input device is available.');
      return;
    }
    const mime = pickRecorderMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    // Real input level and elapsed time, both read from the live stream / recorder.
    const Ctx = window.AudioContext;
    const actx = new Ctx();
    const analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    actx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let startedAt = 0;
    const loop = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      setMicLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      if (recorder.state === 'recording') setMicElapsed((performance.now() - startedAt) / 1000);
      raf = requestAnimationFrame(loop);
    };

    const cleanup = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void actx.close();
      micRef.current = null;
      setMicRecording(false);
      setMicLevel(0);
    };

    recorder.onstop = async () => {
      const type = recorder.mimeType || mime || 'audio/webm';
      cleanup();
      const blob = new Blob(chunks, { type });
      if (blob.size < 200) {
        setError('Nothing was captured. Record for at least a second and make sure the microphone is not muted.');
        return;
      }
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      setResult(null);
      await adoptRecording(blob, `microphone_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${ext}`, 'microphone');
    };
    recorder.onerror = () => {
      cleanup();
      setError('The microphone recorder reported an error.');
    };

    recorder.start();
    startedAt = performance.now();
    setMicElapsed(0);
    setMicRecording(true);
    micRef.current = { recorder, stream, startedAt, stop: () => recorder.state !== 'inactive' && recorder.stop() };
    audio.pause();
    raf = requestAnimationFrame(loop);
  }, [adoptRecording, audio, micSupported]);

  const stopMic = useCallback(() => micRef.current?.stop(), []);
  const mic: MicState = { supported: micSupported, recording: micRecording, elapsed: micElapsed, level: micLevel };

  /* ------------------------------ runs (history) ------------------------------ */
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const refreshRuns = useCallback(() => {
    api
      .runs()
      .then((r) => {
        setRuns(r);
        setRunsLoaded(true);
      })
      .catch(() => setRunsLoaded(true));
  }, []);
  const refreshRunsRef = useRef(refreshRuns);
  useEffect(() => {
    refreshRunsRef.current = refreshRuns;
  });
  useEffect(() => {
    if (backend === 'online') refreshRuns();
  }, [backend, refreshRuns]);

  const openRun = useCallback(
    async (id: string) => {
      setError(null);
      setOperation({ kind: 'loading', label: 'Opening experiment' });
      try {
        const rec = await api.run(id);
        const res = await fetch(api.runAudioUrl(id));
        if (!res.ok) throw new Error('The audio for this run is no longer available.');
        const blob = await res.blob();
        await adoptRecording(blob, rec.filename, 'history', id);
        setResult(rec.result);
        // Restore the configuration the run actually used (preferences only; not re-run).
        const c = rec.result.config ?? {};
        setSettings({
          ...(c.asr_model === 'tiny' || c.asr_model === 'base' ? { asrModel: c.asr_model } : {}),
          ...(c.language === 'en' || c.language === 'ta' || c.language === 'auto' ? { language: c.language } : {}),
          ...(c.vad_filter != null ? { vadFilter: c.vad_filter } : {}),
          ...(c.word_timestamps != null ? { wordTimestamps: c.word_timestamps } : {}),
          ...(c.routing_strategy
            ? c.routing_strategy === 'never_separate'
              ? { adaptive: false }
              : { adaptive: true, strategy: c.routing_strategy as Settings['strategy'] }
            : {}),
          ...(c.lambda_param != null ? { lambdaParam: c.lambda_param } : {}),
          ...(c.threshold != null ? { threshold: c.threshold } : {}),
        });
        navigate('studio');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not open that run.');
      } finally {
        setOperation({ kind: 'idle' });
      }
    },
    [adoptRecording, navigate, setSettings],
  );

  /* ------------------------------ benchmarks ------------------------------ */
  const [benchmark, setBenchmark] = useState<BenchmarkReport | null>(null);
  const [benchmarkLoaded, setBenchmarkLoaded] = useState(false);
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkHistoryItem[]>([]);
  const [viewingBenchmarkId, setViewingBenchmarkId] = useState<string | null>(null);
  const refreshBenchmarks = useCallback(() => {
    api
      .benchmarks()
      .then((b) => setBenchmark(b))
      .catch(() => setBenchmark(null))
      .finally(() => setBenchmarkLoaded(true));
    api.benchmarkHistory().then(setBenchmarkHistory).catch(() => setBenchmarkHistory([]));
  }, []);
  useEffect(() => {
    if (backend === 'online') refreshBenchmarks();
  }, [backend, refreshBenchmarks]);

  const runBenchmark = useCallback(
    async (dataset: string) => {
      setError(null);
      setOperation({ kind: 'benchmark', startedAt: Date.now() });
      try {
        const s = settingsRef.current;
        const report = await api.runBenchmarks(dataset, s.lambdaParam, s.threshold);
        setBenchmark(report);
        setViewingBenchmarkId(null);
        api.benchmarkHistory().then(setBenchmarkHistory).catch(() => undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Benchmark run failed.');
      } finally {
        setOperation({ kind: 'idle' });
      }
    },
    [],
  );

  const viewBenchmark = useCallback(
    async (id: string | null) => {
      try {
        const report = id ? await api.benchmarkFromHistory(id) : await api.benchmarks();
        setBenchmark(report);
        setViewingBenchmarkId(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load that benchmark.');
      }
    },
    [],
  );

  /* ------------------------------ selection + keyboard ------------------------------ */
  const navigatorRef = useRef<((d: number) => void) | null>(null);
  const setNavigator = useCallback((fn: ((d: number) => void) | null) => {
    navigatorRef.current = fn;
  }, []);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const kb = useRef({ toggle, seek, view, time });
  useEffect(() => {
    kb.current = { toggle, seek, view, time };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const k = kb.current;
      if (e.key === '?') {
        setShortcutsOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setCompareOpen(false);
        return;
      }
      if (k.view === 'landing') return;
      if (e.key === ' ' || e.code === 'Space') {
        if (isInteractiveTarget(e.target)) return;
        e.preventDefault();
        k.toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (isInteractiveTarget(e.target) && (e.target as HTMLElement).getAttribute('role') === 'tab') return;
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 2) * (e.key === 'ArrowLeft' ? -1 : 1);
        k.seek(k.time + step);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (navigatorRef.current) {
          e.preventDefault();
          navigatorRef.current(e.key === 'ArrowUp' ? -1 : 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ------------------------------ page title ------------------------------ */
  useEffect(() => {
    const names: Record<View, string> = {
      landing: 'Routone — Adaptive routing for overlapping speech recognition',
      overview: 'Overview · Routone',
      studio: 'ASR Studio · Routone',
      inspector: 'Overlap Inspector · Routone',
      routing: 'Adaptive Routing Lab · Routone',
      benchmarks: 'Benchmarks · Routone',
    };
    document.title = names[view];
  }, [view]);

  const duration = recording?.decoded?.duration ?? mediaDuration;
  const playback: Playback = { playing, time, duration, audio, toggle, restart, seek, playRange };

  const value: Workbench = {
    view,
    navigate,
    health,
    backend,
    refreshHealth,
    operation,
    error,
    clearError,
    settings,
    setSettings,
    demos,
    recording,
    loadDemo,
    loadFile,
    mic,
    startMic,
    stopMic,
    result,
    transcribe,
    playback,
    selectedRegionId,
    selectRegion: setSelectedRegionId,
    selectedSegmentId,
    selectSegment: setSelectedSegmentId,
    setNavigator,
    runs,
    runsLoaded,
    refreshRuns,
    openRun,
    benchmark,
    benchmarkLoaded,
    benchmarkHistory,
    runBenchmark,
    viewBenchmark,
    viewingBenchmarkId,
    shortcutsOpen,
    setShortcutsOpen,
    compareOpen,
    setCompareOpen,
  };

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

