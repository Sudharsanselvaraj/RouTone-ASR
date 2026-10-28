import type {
  OverlapRegion,
  PipelineResult,
  RoutingDecision,
  RoutingMode,
  RunRecord,
  SeparationResult,
  TranscriptSegment,
} from '../types';
import { fmtMs, fmtNum, DASH } from './format';

export const DECISION_LABEL: Record<RoutingMode, string> = {
  ROUTE_SEPARATION: 'Route through separation',
  KEEP_MIXTURE: 'Transcribe directly',
  FLAG_REVIEW: 'Insufficient evidence',
};
export const DECISION_SHORT: Record<RoutingMode, string> = { ROUTE_SEPARATION: 'Separate', KEEP_MIXTURE: 'Direct', FLAG_REVIEW: 'Review' };

export function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.max(a0, b0) < Math.min(a1, b1);
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export type TranscriptView = 'final' | 'baseline' | 'separated';

/** Only views backed by actual segments are offered. */
export function availableViews(r: PipelineResult): { id: TranscriptView; label: string; segments: TranscriptSegment[] }[] {
  const views: { id: TranscriptView; label: string; segments: TranscriptSegment[] }[] = [
    { id: 'final', label: 'Final attributed', segments: r.final_transcript },
    { id: 'baseline', label: 'Mixture baseline', segments: r.baseline_segments },
    { id: 'separated', label: 'Separated streams', segments: r.reconciliation.separated_segments },
  ];
  return views.filter((v) => v.segments.length > 0);
}

export type RegionOutcome =
  | 'mixture_kept'
  | 'streams_used'
  | 'fell_back_to_mixture'
  | 'separation_failed'
  | 'flagged_for_review';

export const OUTCOME_LABEL: Record<RegionOutcome, string> = {
  mixture_kept: 'Mixture transcript kept',
  streams_used: 'Separated streams used',
  fell_back_to_mixture: 'Separation yielded no text; mixture restored',
  separation_failed: 'Separation failed; mixture used',
  flagged_for_review: 'Flagged for review (not separated)',
};

export interface RegionAnalysis {
  region: OverlapRegion;
  decision: RoutingDecision | undefined;
  separation: SeparationResult | undefined;
  outcome: RegionOutcome;
  baselineSegments: TranscriptSegment[];
  streamSegments: TranscriptSegment[];
  finalSegments: TranscriptSegment[];
}

export function analyzeRegion(r: PipelineResult, region: OverlapRegion): RegionAnalysis {
  const decision = r.routing_decisions.find((d) => d.region_id === region.region_id);
  const separation = r.separation_results?.find((s) => s.region_id === region.region_id);
  const inRegion = (s: TranscriptSegment) => overlaps(s.start, s.end, region.start, region.end);
  const finalSegments = r.final_transcript.filter(inRegion);
  let outcome: RegionOutcome = 'mixture_kept';
  if (decision?.decision === 'FLAG_REVIEW') outcome = 'flagged_for_review';
  else if (decision?.decision === 'ROUTE_SEPARATION') {
    if (separation && !separation.success) outcome = 'separation_failed';
    else if (finalSegments.some((s) => s.source_path.startsWith('separated'))) outcome = 'streams_used';
    else outcome = 'fell_back_to_mixture';
  }
  return {
    region,
    decision,
    separation,
    outcome,
    baselineSegments: r.baseline_segments.filter(inRegion),
    streamSegments: r.reconciliation.separated_segments.filter(inRegion),
    finalSegments,
  };
}

export interface ReconAudit {
  baselineSegments: number;
  separatedSegments: number;
  finalSegments: number;
  baselineWords: number;
  finalWords: number;
  routedRegions: number;
  flaggedRegions: number;
  fellBackRegions: number;
  wordsFromStreams: number;
  baselineWordsReplaced: number;
  separatedSegmentsDropped: number;
  separatedWordsDropped: number;
  backend: { conflicts_resolved: number; words_added: number; words_rejected: number };
}

/** Everything here is computed from the three transcripts; nothing is a stored total. */
export function reconciliationAudit(r: PipelineResult): ReconAudit {
  const rec = r.reconciliation;
  const finalIds = new Set(rec.final_segments.map((s) => s.id));
  const words = (segs: TranscriptSegment[]) => segs.reduce((n, s) => n + countWords(s.text), 0);
  const dropped = rec.separated_segments.filter((s) => !finalIds.has(s.id));
  const replaced = rec.baseline_segments.filter(
    (b) => !rec.final_segments.some((f) => f.id === b.id && f.source_path === b.source_path),
  );
  const regions = r.detected_overlaps.map((o) => analyzeRegion(r, o));
  return {
    baselineSegments: rec.baseline_segments.length,
    separatedSegments: rec.separated_segments.length,
    finalSegments: rec.final_segments.length,
    baselineWords: words(rec.baseline_segments),
    finalWords: words(rec.final_segments),
    routedRegions: r.routing_decisions.filter((d) => d.decision === 'ROUTE_SEPARATION').length,
    flaggedRegions: r.routing_decisions.filter((d) => d.decision === 'FLAG_REVIEW').length,
    fellBackRegions: regions.filter((a) => a.outcome === 'fell_back_to_mixture' || a.outcome === 'separation_failed').length,
    wordsFromStreams: words(rec.final_segments.filter((s) => s.source_path.startsWith('separated'))),
    baselineWordsReplaced: words(replaced),
    separatedSegmentsDropped: dropped.length,
    separatedWordsDropped: words(dropped),
    backend: {
      conflicts_resolved: rec.conflicts_resolved,
      words_added: rec.words_added_from_separation,
      words_rejected: rec.words_rejected_as_hallucinations,
    },
  };
}

/* ------------------------------ run comparison ------------------------------ */

export interface CompareRow {
  group: 'Configuration' | 'Measured' | 'Output';
  label: string;
  a: string;
  b: string;
  differs: boolean;
}

const yn = (v: boolean | undefined) => (v == null ? DASH : v ? 'on' : 'off');
const str = (v: unknown) => (v == null || v === '' ? DASH : String(v));

export function compareRuns(a: RunRecord, b: RunRecord): { rows: CompareRow[]; notes: string[] } {
  const ra = a.result;
  const rb = b.result;
  const ca = ra.config ?? {};
  const cb = rb.config ?? {};
  const rows: CompareRow[] = [];
  const add = (group: CompareRow['group'], label: string, x: string, y: string) =>
    rows.push({ group, label, a: x, b: y, differs: x !== y });

  add('Configuration', 'ASR model', str(ca.asr_model), str(cb.asr_model));
  add('Configuration', 'Language', str(ca.language), str(cb.language));
  add('Configuration', 'Voice activity detection', yn(ca.vad_filter), yn(cb.vad_filter));
  add('Configuration', 'Word timestamps', yn(ca.word_timestamps), yn(cb.word_timestamps));
  add('Configuration', 'Routing strategy', str(ca.routing_strategy ?? ca.controller), str(cb.routing_strategy ?? cb.controller));
  add('Configuration', 'Latency penalty λ', fmtNum(ca.lambda_param, 2), fmtNum(cb.lambda_param, 2));
  add('Configuration', 'Threshold θ', fmtNum(ca.threshold, 2), fmtNum(cb.threshold, 2));

  add('Measured', 'Recording duration', `${ra.audio_metadata.duration_seconds.toFixed(2)} s`, `${rb.audio_metadata.duration_seconds.toFixed(2)} s`);
  add('Measured', 'Candidate overlap regions', String(ra.detected_overlaps.length), String(rb.detected_overlaps.length));
  add('Measured', 'Regions separated', String(ra.metrics.separated_regions_count), String(rb.metrics.separated_regions_count));
  add('Measured', 'Baseline ASR time', fmtMs(ra.metrics.baseline_transcribe_time_ms), fmtMs(rb.metrics.baseline_transcribe_time_ms));
  add('Measured', 'Separation time (sum)', fmtMs(ra.metrics.separation_time_ms), fmtMs(rb.metrics.separation_time_ms));
  add('Measured', 'Total processing time', fmtMs(ra.processing_time_ms), fmtMs(rb.processing_time_ms));
  add('Measured', 'Real-time factor', fmtNum(ra.metrics.real_time_factor, 3), fmtNum(rb.metrics.real_time_factor, 3));

  add('Output', 'Final segments', String(ra.final_transcript.length), String(rb.final_transcript.length));
  add('Output', 'Final words', String(reconciliationAudit(ra).finalWords), String(reconciliationAudit(rb).finalWords));
  add('Output', 'Separated-stream segments', String(ra.reconciliation.separated_segments.length), String(rb.reconciliation.separated_segments.length));
  add('Output', 'Detected language', str(ra.metrics.detected_language), str(rb.metrics.detected_language));

  const notes: string[] = [];
  const sameName = a.filename === b.filename;
  const sameDur = Math.abs(ra.audio_metadata.duration_seconds - rb.audio_metadata.duration_seconds) < 0.05;
  if (!sameName || !sameDur) {
    notes.push(
      'These runs processed different recordings. Timing and region counts are not comparable between them; ' +
        'only the real-time factor normalizes for duration, and it is still content dependent.',
    );
  } else {
    notes.push('Same recording (matching name and duration). No reference transcript exists, so output differences cannot be scored as better or worse.');
  }
  if (ca.asr_model !== cb.asr_model) notes.push('The ASR model differs, so timing and text differences mix model and routing effects.');
  return { rows, notes };
}
