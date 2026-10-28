import { createContext, useContext } from 'react';
import type {
  BenchmarkHistoryItem,
  BenchmarkReport,
  DemoInfo,
  HealthInfo,
  PipelineResult,
  RoutingStrategy,
  RunSummary,
} from '../types';
import type { DecodedAudio } from '../lib/audio';

export type View = 'landing' | 'overview' | 'studio' | 'inspector' | 'routing' | 'benchmarks';
export const VIEW_ORDER: View[] = ['overview', 'studio', 'inspector', 'routing', 'benchmarks'];

export type RecordingSource = 'demo' | 'upload' | 'microphone' | 'history';

export interface Recording {
  id: string;
  name: string;
  source: RecordingSource;
  blob: Blob;
  url: string;
  sizeBytes: number;
  decoded: DecodedAudio | null;
  peaks: Float32Array | null;
  decodeError: string | null;
  /** Sample rate from a WAV header; null for other containers (not guessed). */
  sourceSampleRate: number | null;
  runId?: string;
}

export interface Settings {
  language: 'auto' | 'en' | 'ta';
  asrModel: 'tiny' | 'base';
  vadFilter: boolean;
  wordTimestamps: boolean;
  adaptive: boolean;
  strategy: Exclude<RoutingStrategy, 'never_separate'>;
  lambdaParam: number;
  threshold: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  asrModel: 'tiny',
  vadFilter: true,
  wordTimestamps: true,
  adaptive: true,
  strategy: 'benefit_aware',
  lambdaParam: 0.45,
  threshold: 0.5,
};

export function effectiveStrategy(s: Settings): RoutingStrategy {
  return s.adaptive ? s.strategy : 'never_separate';
}

export type Backend = 'connecting' | 'online' | 'offline';
export type Operation =
  | { kind: 'idle' }
  | { kind: 'loading'; label: string }
  | { kind: 'transcribing'; startedAt: number }
  | { kind: 'benchmark'; startedAt: number };

export interface MicState {
  supported: boolean;
  recording: boolean;
  /** Seconds since MediaRecorder actually started (wall-clock), 0 when not recording. */
  elapsed: number;
  /** Live input RMS in 0..1 from the microphone stream. */
  level: number;
}

export interface Playback {
  playing: boolean;
  time: number;
  duration: number;
  audio: HTMLAudioElement;
  toggle: () => void;
  restart: () => void;
  seek: (t: number) => void;
  /** Plays [start, end] and pauses at end. Never called by selection; only by explicit play buttons. */
  playRange: (start: number, end: number) => void;
}

export interface Workbench {
  view: View;
  navigate: (v: View) => void;

  health: HealthInfo | null;
  backend: Backend;
  refreshHealth: () => void;
  operation: Operation;
  error: string | null;
  clearError: () => void;

  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;

  demos: DemoInfo[];
  recording: Recording | null;
  loadDemo: (id: string, opts?: { autoTranscribe?: boolean }) => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  mic: MicState;
  startMic: () => Promise<void>;
  stopMic: () => void;

  result: PipelineResult | null;
  /** Settings that produced `result` (from the backend echo). */
  transcribe: () => Promise<void>;
  playback: Playback;

  selectedRegionId: string | null;
  selectRegion: (id: string | null) => void;
  selectedSegmentId: string | null;
  selectSegment: (id: string | null) => void;
  setNavigator: (fn: ((delta: number) => void) | null) => void;

  runs: RunSummary[];
  runsLoaded: boolean;
  refreshRuns: () => void;
  openRun: (id: string) => Promise<void>;

  benchmark: BenchmarkReport | null;
  benchmarkLoaded: boolean;
  benchmarkHistory: BenchmarkHistoryItem[];
  runBenchmark: (dataset: string) => Promise<void>;
  viewBenchmark: (id: string | null) => Promise<void>;
  viewingBenchmarkId: string | null;

  shortcutsOpen: boolean;
  setShortcutsOpen: (b: boolean) => void;
  compareOpen: boolean;
  setCompareOpen: (b: boolean) => void;
}

export const WorkbenchContext = createContext<Workbench | null>(null);

export function useWorkbench(): Workbench {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error('useWorkbench must be used inside <WorkbenchProvider>');
  return ctx;
}
