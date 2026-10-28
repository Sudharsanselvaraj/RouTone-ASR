export interface AudioMetadata {
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  rms_energy: number;
  peak_amplitude: number;
  estimated_snr_db: number;
  codec?: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  probability: number;
  speaker?: string;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
  language: string;
  avg_logprob: number;
  no_speech_prob: number;
  words: TranscriptWord[];
  source_path: string;
  confidence: number;
}

export interface OverlapRegion {
  region_id: string;
  start: number;
  end: number;
  duration: number;
  overlap_score: number;
  speaker_count_estimate: number;
  snr_estimate_db: number;
  energy_variance: number;
  pitch_clash_index: number;
}

export type RoutingMode = 'ROUTE_SEPARATION' | 'KEEP_MIXTURE' | 'FLAG_REVIEW';

export interface RoutingDecision {
  region_id: string;
  start: number;
  end: number;
  decision: RoutingMode;
  predicted_benefit: number;
  normalized_cost: number;
  utility: number;
  features: Record<string, number>;
  rationale: string;
  lambda_param: number;
}

export interface SeparationResult {
  region_id: string;
  stream_a_audio_b64?: string | null;
  stream_b_audio_b64?: string | null;
  separation_duration_ms: number;
  rms_ratio_db: number;
  success: boolean;
  fallback_used: boolean;
  details: string;
  window_start?: number | null;
  window_end?: number | null;
}

export interface TraceEvent {
  event: string;
  t_ms: number;
  duration_ms?: number | null;
  region_id?: string | null;
  detail: string;
}

export interface ReconciliationResult {
  baseline_segments: TranscriptSegment[];
  separated_segments: TranscriptSegment[];
  final_segments: TranscriptSegment[];
  conflicts_resolved: number;
  words_added_from_separation: number;
  words_rejected_as_hallucinations: number;
}

export interface RunConfig {
  asr_model?: string;
  language?: string;
  vad_filter?: boolean;
  word_timestamps?: boolean;
  routing_strategy?: string;
  controller?: string;
  lambda_param?: number | null;
  threshold?: number | null;
  filename?: string;
}

export interface PipelineResult {
  audio_metadata: AudioMetadata;
  baseline_segments: TranscriptSegment[];
  detected_overlaps: OverlapRegion[];
  routing_decisions: RoutingDecision[];
  reconciliation: ReconciliationResult;
  final_transcript: TranscriptSegment[];
  metrics: {
    total_audio_duration_s: number;
    baseline_transcribe_time_ms: number;
    total_processing_time_ms: number;
    real_time_factor: number;
    overlap_regions_count: number;
    separated_regions_count: number;
    separation_invocation_rate: number;
    detected_language: string;
    separation_time_ms?: number;
  };
  processing_time_ms: number;
  separation_results?: SeparationResult[];
  trace?: TraceEvent[];
  config?: RunConfig;
  run_id?: string | null;
}

export interface RunSummary {
  id: string;
  created_at: string;
  filename: string;
  duration_s: number;
  overlap_regions: number;
  separated_regions: number | null;
  real_time_factor: number | null;
  processing_time_ms: number | null;
  language: string | null;
  config: RunConfig;
}

export interface RunRecord {
  id: string;
  created_at: string;
  filename: string;
  audio_file: string;
  result: PipelineResult;
}

export interface EvaluationMetricSummary {
  method_name: string;
  speaker_attributed_wer: number;
  standard_wer: number;
  overlap_wer: number;
  speaker_recalls: Record<string, number>;
  p50_latency_ms: number;
  p90_latency_ms: number;
  p95_latency_ms: number;
  /** null when no region was detected (undefined, not zero). Absent in legacy reports. */
  separation_invocation_rate: number | null;
  total_regions_processed: number;
  evaluated_samples_count: number;
  reference_word_count?: number;
  hypothesis_word_count?: number;
  empty_hypothesis_samples?: number;
  separated_regions?: number;
  latency_ms_samples?: number[];
  valid?: boolean;
  notes?: string[];
}

export type BenchmarkStatus = 'valid' | 'invalid' | 'incomplete' | 'unknown';

export interface BenchmarkReport {
  timestamp: string;
  dataset_name: string;
  results: EvaluationMetricSummary[];
  pareto_optimal_system: string;
  summary_analysis: string;
  /** Absent in legacy reports written before integrity checks existed. */
  status?: BenchmarkStatus;
  warnings?: string[];
  pareto_front?: string[];
  dataset?: {
    contains_speech?: boolean;
    audio_sources?: string[];
    samples_total?: number;
    samples_evaluated?: number;
    samples_skipped_empty_reference?: string[];
    sample_ids?: string[];
    references_available?: boolean;
    reference_words?: number;
  };
  not_evaluated?: Record<string, string>;
  config?: {
    asr_model?: string;
    lambda_param?: number;
    threshold?: number;
    warmup_pass?: boolean;
    definitions?: Record<string, string>;
  };
}

export interface BenchmarkHistoryItem {
  id: string;
  timestamp: string;
  dataset_name: string;
  status: BenchmarkStatus;
  strategies: string[];
  samples: number | null;
}

export interface HealthInfo {
  status: string;
  version: string;
  torch_version?: string;
  mps_available?: boolean;
  runtime?: {
    asr: {
      engine: string;
      model_size: string;
      device: string;
      compute_type: string;
      loaded: boolean;
      available_models: string[];
      supported_models: string[];
    };
    separation: {
      model: string;
      device: string;
      loaded: boolean;
      weights_cached: boolean;
    };
    accelerator: { mps_available: boolean; mps_used: boolean };
  };
  routing?: {
    strategies: string[];
    benefit_aware: {
      calibrated: boolean;
      benefit: string;
      cost: string;
      utility: string;
      rule: string;
    };
  };
  demo_available?: string[];
}

export interface DemoInfo {
  id: string;
  filename: string;
  size_bytes: number;
  label: string;
  description: string;
}

export type RoutingStrategy = 'benefit_aware' | 'threshold' | 'always_separate' | 'never_separate';

export interface ReplayPolicy {
  name: string;
  strategy: RoutingStrategy;
  lambda_param: number;
  threshold: number;
}

export interface ReplayResponse {
  policies: { policy: ReplayPolicy; decisions: RoutingDecision[] }[];
}
