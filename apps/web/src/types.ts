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

export interface RoutingDecision {
  region_id: string;
  start: number;
  end: number;
  decision: "ROUTE_SEPARATION" | "KEEP_MIXTURE" | "FLAG_REVIEW";
  predicted_benefit: number;
  normalized_cost: number;
  utility: number;
  features: Record<string, number>;
  rationale: string;
  lambda_param: number;
}

export interface ReconciliationResult {
  baseline_segments: TranscriptSegment[];
  separated_segments: TranscriptSegment[];
  final_segments: TranscriptSegment[];
  conflicts_resolved: number;
  words_added_from_separation: number;
  words_rejected_as_hallucinations: number;
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
  };
  processing_time_ms: number;
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
  separation_invocation_rate: number;
  total_regions_processed: number;
  evaluated_samples_count: number;
}

export interface BenchmarkReport {
  timestamp: string;
  dataset_name: string;
  results: EvaluationMetricSummary[];
  pareto_optimal_system: string;
  summary_analysis: string;
}
