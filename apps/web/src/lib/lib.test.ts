import { describe, expect, it } from 'vitest';
import { srtTime, vttTime, toSrt, toVtt, toTxt, resultForJson, safeStem, buildExport } from './export';
import { computePeaks, encodeWav } from './audio';
import { analyzeRegion, availableViews, compareRuns, reconciliationAudit } from './analysis';
import { fmtClock, fmtMs, fmtPct, fmtNum, DASH } from './format';
import { buildBenchmarkReport, buildRunReport } from './report';
import type { BenchmarkReport, PipelineResult, RunRecord, TranscriptSegment } from '../types';

const seg = (o: Partial<TranscriptSegment>): TranscriptSegment => ({
  id: 's', start: 0, end: 1, speaker: 'Speaker 1', text: 'hello world', language: 'en',
  avg_logprob: -0.3, no_speech_prob: 0, words: [], source_path: 'mixture', confidence: 0.7, ...o,
});

function result(over: Partial<PipelineResult> = {}): PipelineResult {
  const base = [seg({ id: 'b0', start: 0, end: 5, text: 'mixture words here' })];
  const sepA = seg({ id: 'a0', start: 1, end: 3, text: 'stream a text', source_path: 'separated_stream_a' });
  const sepB = seg({ id: 'b1', start: 1, end: 3, speaker: 'Speaker 2', text: 'you you you you you', source_path: 'separated_stream_b' });
  return {
    audio_metadata: { duration_seconds: 5, sample_rate: 16000, channels: 1, rms_energy: 0.1, peak_amplitude: 0.5, estimated_snr_db: 10 },
    baseline_segments: base,
    detected_overlaps: [{ region_id: 'ov_0', start: 1, end: 3, duration: 2, overlap_score: 0.4, speaker_count_estimate: 2, snr_estimate_db: 14, energy_variance: 0, pitch_clash_index: 0.5 }],
    routing_decisions: [{ region_id: 'ov_0', start: 1, end: 3, decision: 'ROUTE_SEPARATION', predicted_benefit: 0.8, normalized_cost: 0.2, utility: 0.7, features: {}, rationale: 'r', lambda_param: 0.45 }],
    reconciliation: { baseline_segments: base, separated_segments: [sepA, sepB], final_segments: [sepA], conflicts_resolved: 1, words_added_from_separation: 0, words_rejected_as_hallucinations: 0 },
    final_transcript: [sepA],
    metrics: { total_audio_duration_s: 5, baseline_transcribe_time_ms: 100, total_processing_time_ms: 900, real_time_factor: 0.18, overlap_regions_count: 1, separated_regions_count: 1, separation_invocation_rate: 1, detected_language: 'en', separation_time_ms: 300 },
    processing_time_ms: 900,
    separation_results: [{ region_id: 'ov_0', separation_duration_ms: 300, rms_ratio_db: 1, success: true, fallback_used: false, details: 'ok' }],
    trace: [], config: { asr_model: 'tiny', routing_strategy: 'benefit_aware' },
    ...over,
  };
}

describe('export formats', () => {
  it('formats SRT/VTT times from integer milliseconds (no 60.000 rounding glitch)', () => {
    expect(srtTime(59.9996)).toBe('00:01:00,000');
    expect(vttTime(3661.5)).toBe('01:01:01.500');
    expect(srtTime(-1)).toBe('00:00:00,000');
  });
  it('writes TXT/SRT/VTT that match the given segments', () => {
    const segs = [seg({ id: '1', start: 0.5, end: 1.25, text: 'one' }), seg({ id: '2', start: 2, end: 3, speaker: 'Speaker 2', text: 'two' })];
    expect(toTxt(segs)).toContain('[0.50 - 1.25] Speaker 1: one');
    expect(toSrt(segs)).toBe('1\n00:00:00,500 --> 00:00:01,250\n[Speaker 1] one\n\n2\n00:00:02,000 --> 00:00:03,000\n[Speaker 2] two\n');
    expect(toVtt(segs).startsWith('WEBVTT\n\n1\n00:00:00.500 --> 00:00:01.250\n<v Speaker 1>one')).toBe(true);
  });
  it('JSON export omits embedded audio but keeps every result field', () => {
    const r = result({ separation_results: [{ region_id: 'ov_0', stream_a_audio_b64: 'AAAA', stream_b_audio_b64: 'BBBB', separation_duration_ms: 1, rms_ratio_db: 0, success: true, fallback_used: false, details: '' }] });
    const out = resultForJson(r);
    expect(out.separation_results?.[0].stream_a_audio_b64).toBe('[omitted]');
    expect(out.final_transcript).toEqual(r.final_transcript);
    expect(JSON.parse(buildExport('json', [], r).content).routing_decisions).toHaveLength(1);
  });
  it('sanitises file stems', () => {
    expect(safeStem('My Rec (1).wav')).toBe('My_Rec_1');
    expect(safeStem('')).toBe('recording');
  });
});

describe('audio analysis', () => {
  it('computes min/max peaks from real samples', () => {
    const s = new Float32Array([0, 0.5, -0.25, 1, -1, 0.1, 0, 0]);
    const p = computePeaks(s, 8, 2);
    // bucket 0 = [0, .5, -.25, 1] -> min -.25 / max 1; bucket 1 = [-1, .1, 0, 0] -> min -1 / max .1
    expect(Array.from(p).map((v) => Number(v.toFixed(3)))).toEqual([-0.25, 1, -1, 0.1]);
  });
  it('encodes a valid mono 16-bit WAV header', async () => {
    const blob = encodeWav(new Float32Array(100), 16000);
    expect(blob.size).toBe(44 + 200);
    const view = new DataView(await blob.arrayBuffer());
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(16000);
  });
});

describe('result analysis', () => {
  it('offers only transcript views backed by data', () => {
    const r = result({ baseline_segments: [], reconciliation: { ...result().reconciliation, baseline_segments: [], separated_segments: [] } });
    expect(availableViews(r).map((v) => v.id)).toEqual(['final']);
    expect(availableViews(result()).map((v) => v.id)).toEqual(['final', 'baseline', 'separated']);
  });
  it('derives a region outcome from the transcripts, not from the decision alone', () => {
    const r = result();
    expect(analyzeRegion(r, r.detected_overlaps[0]).outcome).toBe('streams_used');
    const fallback = result({ final_transcript: [seg({ id: 'b0', start: 0, end: 5, source_path: 'mixture_fallback' })] });
    expect(analyzeRegion(fallback, fallback.detected_overlaps[0]).outcome).toBe('fell_back_to_mixture');
    const kept = result({ routing_decisions: [{ ...result().routing_decisions[0], decision: 'KEEP_MIXTURE' }], final_transcript: result().baseline_segments });
    expect(analyzeRegion(kept, kept.detected_overlaps[0]).outcome).toBe('mixture_kept');
  });
  it('computes the reconciliation audit from transcript text', () => {
    const au = reconciliationAudit(result());
    expect(au.wordsFromStreams).toBe(3);
    expect(au.separatedSegmentsDropped).toBe(1); // the repetitive stream-B segment never reached the final transcript
    expect(au.separatedWordsDropped).toBe(5);
    expect(au.baselineWordsReplaced).toBe(3);
  });
  it('compares two runs and warns when recordings differ', () => {
    const a: RunRecord = { id: 'a', created_at: '', filename: 'x.wav', audio_file: 'audio.wav', result: result() };
    const b: RunRecord = { id: 'b', created_at: '', filename: 'y.wav', audio_file: 'audio.wav', result: result({ processing_time_ms: 1800, config: { asr_model: 'base', routing_strategy: 'threshold' } }) };
    const { rows, notes } = compareRuns(a, b);
    expect(rows.find((r) => r.label === 'ASR model')).toMatchObject({ a: 'tiny', b: 'base', differs: true });
    expect(rows.find((r) => r.label === 'Recording duration')?.differs).toBe(false);
    expect(notes.join(' ')).toMatch(/different recordings/);
  });
});

describe('formatting', () => {
  it('never turns missing values into zero', () => {
    expect(fmtNum(null)).toBe(DASH);
    expect(fmtPct(undefined)).toBe(DASH);
    expect(fmtMs(NaN)).toBe(DASH);
    expect(fmtClock(null)).toBe(DASH);
  });
  it('formats values', () => {
    expect(fmtClock(83.4)).toBe('1:23.40');
    expect(fmtMs(1500)).toBe('1.50 s');
    expect(fmtPct(0.5)).toBe('50.0%');
  });
});

describe('reports', () => {
  it('run report states the absence of references and labels estimates', () => {
    const md = buildRunReport(result(), 'x.wav', { sampleRateHz: null });
    expect(md).toMatch(/Reference transcript: \*\*not available\*\*/);
    expect(md).toMatch(/Known limitations/);
    expect(md).toMatch(/fixed default of 2/);
    expect(md).toMatch(/not available \(non-WAV or run history\)/);
  });
  it('benchmark report prints unavailable values as dashes and carries the status', () => {
    const rep: BenchmarkReport = {
      timestamp: '2026-01-01T00:00:00', dataset_name: 'd', pareto_optimal_system: 'Not determined', summary_analysis: 'invalid', status: 'invalid',
      warnings: ['no speech'], results: [{ method_name: 'A', speaker_attributed_wer: 1, standard_wer: 1, overlap_wer: 1, speaker_recalls: {}, p50_latency_ms: 10, p90_latency_ms: 10, p95_latency_ms: 10, separation_invocation_rate: null, total_regions_processed: 0, evaluated_samples_count: 1 }],
    };
    const md = buildBenchmarkReport(rep);
    expect(md).toMatch(/Status: \*\*INVALID\*\*/);
    expect(md).toContain(`| ${DASH} | 0 | 1 |`);
  });
});
