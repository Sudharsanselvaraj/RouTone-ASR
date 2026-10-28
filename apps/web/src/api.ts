import type {
  BenchmarkHistoryItem,
  BenchmarkReport,
  DemoInfo,
  HealthInfo,
  PipelineResult,
  ReplayPolicy,
  ReplayResponse,
  RoutingDecision,
  RunRecord,
  RunSummary,
} from './types';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError('Cannot reach the Routone backend. Start it with `make server`.', 0);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export interface TranscribeOptions {
  language: string;
  asrModel: string;
  vadFilter: boolean;
  wordTimestamps: boolean;
  routingStrategy: string;
  lambdaParam: number;
  threshold: number;
}

export const api = {
  health: () => request<HealthInfo>('/api/health'),
  demos: () => request<DemoInfo[]>('/api/demos'),
  demoAudioUrl: (id: string) => `${API_BASE}/api/demos/${id}/audio`,
  runs: () => request<RunSummary[]>('/api/runs'),
  run: (id: string) => request<RunRecord>(`/api/runs/${id}`),
  runAudioUrl: (id: string) => `${API_BASE}/api/runs/${id}/audio`,
  benchmarks: () => request<BenchmarkReport>('/api/benchmarks'),
  benchmarkHistory: () => request<BenchmarkHistoryItem[]>('/api/benchmarks/history'),
  benchmarkFromHistory: (id: string) => request<BenchmarkReport>(`/api/benchmarks/history/${id}`),
  benchmarksCsvUrl: `${API_BASE}/results/benchmarks.csv`,
  runBenchmarks: (dataset: string, lambdaParam: number, threshold: number) =>
    request<BenchmarkReport>(
      `/api/run-benchmarks?dataset=${encodeURIComponent(dataset)}&lambda_param=${lambdaParam}&threshold=${threshold}`,
      { method: 'POST' },
    ),
  replay: (decisions: RoutingDecision[], policies: ReplayPolicy[]) =>
    request<ReplayResponse>('/api/routing/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions, policies }),
    }),
  transcribe: (blob: Blob, filename: string, o: TranscribeOptions) => {
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('include_audio', 'true');
    if (o.language !== 'auto') form.append('language', o.language);
    form.append('asr_model', o.asrModel);
    form.append('vad_filter', String(o.vadFilter));
    form.append('word_timestamps', String(o.wordTimestamps));
    form.append('routing_strategy', o.routingStrategy);
    form.append('lambda_param', String(o.lambdaParam));
    form.append('threshold', String(o.threshold));
    return request<PipelineResult>('/api/transcribe', { method: 'POST', body: form });
  },
};
