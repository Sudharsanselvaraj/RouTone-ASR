import type { BenchmarkReport, PipelineResult } from '../types';
import { fmtDateTime, fmtMs, fmtNum, fmtPct, DASH } from './format';
import { OUTCOME_LABEL, analyzeRegion, reconciliationAudit } from './analysis';

/** Limitations that hold for the current implementation (verified against the backend source). */
export const KNOWN_LIMITATIONS = [
  'Overlap regions come from a heuristic acoustic detector. Its overlap score is not a calibrated probability, and it can flag regions in single-speaker audio.',
  'The speaker count per region is a fixed default of 2 in the detector, not an estimate computed from the audio.',
  'Predicted benefit is a hand-set logistic heuristic over acoustic and ASR-confidence features. It is not calibrated against measured WER improvements.',
  'Normalized cost is a linear latency estimate (0.12 s per second of region plus 0.25 s), not a measurement. Measured separation time is reported separately when separation actually ran.',
  'ASR (faster-whisper) and separation (ConvTasNet) both run on CPU; an available Apple MPS device is not used.',
  'Separation assumes at most two concurrent speakers.',
  'ASR Studio recordings have no reference transcript, so no WER can be computed for them.',
];

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function buildRunReport(result: PipelineResult, filename: string, audioInfo: { sampleRateHz?: number | null }): string {
  const c = result.config ?? {};
  const audit = reconciliationAudit(result);
  const lines: string[] = [];
  lines.push(`# Routone experiment report`, '');
  lines.push(`Recording: **${filename}**  `);
  if (result.run_id) lines.push(`Run id: \`${result.run_id}\`  `);
  lines.push(`Generated: ${new Date().toISOString()}`, '');

  lines.push('## Experiment configuration', '');
  lines.push('| Setting | Value |', '|---|---|');
  const cfg: [string, string][] = [
    ['ASR model', c.asr_model ?? DASH],
    ['Language', c.language ?? DASH],
    ['Voice activity detection', c.vad_filter == null ? DASH : c.vad_filter ? 'on' : 'off'],
    ['Word timestamps', c.word_timestamps == null ? DASH : c.word_timestamps ? 'on' : 'off'],
    ['Routing strategy', c.routing_strategy ?? c.controller ?? DASH],
    ['Latency penalty λ', fmtNum(c.lambda_param, 2)],
    ['Threshold θ', fmtNum(c.threshold, 2)],
  ];
  cfg.forEach(([k, v]) => lines.push(`| ${k} | ${cell(v)} |`));

  lines.push('', '## Dataset / recording', '');
  const m = result.audio_metadata;
  lines.push(`- Duration: ${m.duration_seconds.toFixed(2)} s`);
  lines.push(`- Source sample rate: ${audioInfo.sampleRateHz ? `${audioInfo.sampleRateHz} Hz` : 'not available (non-WAV or run history)'}; analysed at ${m.sample_rate} Hz mono`);
  lines.push(`- Signal-to-noise estimate: ${m.estimated_snr_db} dB (estimate)`);

  lines.push('', '## Reference and hypothesis availability', '');
  lines.push('- Reference transcript: **not available** (no WER can be computed for this recording)');
  lines.push(`- Hypotheses: final ${result.final_transcript.length} segment(s), mixture baseline ${result.baseline_segments.length}, separated streams ${result.reconciliation.separated_segments.length}`);

  lines.push('', '## Metrics (measured)', '');
  lines.push(`- Total processing time: ${fmtMs(result.processing_time_ms)}`);
  lines.push(`- Baseline ASR time: ${fmtMs(result.metrics.baseline_transcribe_time_ms)}`);
  lines.push(`- Separation time (sum over regions): ${result.metrics.separation_time_ms == null ? 'not recorded' : fmtMs(result.metrics.separation_time_ms)}`);
  lines.push(`- Real-time factor: ${fmtNum(result.metrics.real_time_factor, 3)}`);
  lines.push(`- Candidate regions: ${result.detected_overlaps.length}; routed to separation: ${result.metrics.separated_regions_count}`);
  lines.push(`- Words: baseline ${audit.baselineWords}, final ${audit.finalWords} (${audit.wordsFromStreams} from separated streams)`);

  lines.push('', '## Routing decisions', '');
  if (result.detected_overlaps.length === 0) {
    lines.push('No candidate overlap regions were detected; nothing was routed.');
  } else {
    lines.push('| Region | Interval (s) | Overlap score (heuristic) | Predicted benefit (heuristic) | Cost (estimate) | Decision | Measured separation | Outcome |', '|---|---|---|---|---|---|---|---|');
    result.detected_overlaps.forEach((o) => {
      const a = analyzeRegion(result, o);
      const d = a.decision;
      lines.push(
        `| ${o.region_id} | ${o.start.toFixed(2)}–${o.end.toFixed(2)} | ${o.overlap_score.toFixed(3)} | ${fmtNum(d?.predicted_benefit, 3)} | ${fmtNum(d?.normalized_cost, 3)} | ${d?.decision ?? DASH} | ${a.separation ? fmtMs(a.separation.separation_duration_ms) : 'not run'} | ${OUTCOME_LABEL[a.outcome]} |`,
      );
    });
  }

  lines.push('', '## Processing trace', '');
  if (result.trace?.length) {
    lines.push('| t (ms) | Event | Duration | Detail |', '|---|---|---|---|');
    result.trace.forEach((e) =>
      lines.push(`| ${e.t_ms.toFixed(1)} | ${e.event}${e.region_id ? ` (${e.region_id})` : ''} | ${e.duration_ms == null ? DASH : fmtMs(e.duration_ms, 1)} | ${cell(e.detail)} |`),
    );
  } else lines.push('This run has no recorded trace.');

  lines.push('', '## Known limitations', '');
  KNOWN_LIMITATIONS.forEach((l) => lines.push(`- ${l}`));
  return lines.join('\n') + '\n';
}

export function buildBenchmarkReport(r: BenchmarkReport): string {
  const status = r.status ?? 'unknown';
  const lines: string[] = [];
  lines.push('# Routone benchmark report', '');
  lines.push(`Status: **${status.toUpperCase()}**  `);
  lines.push(`Run: ${fmtDateTime(r.timestamp)}  `);
  lines.push(`Dataset: ${r.dataset_name}`, '');
  if (r.warnings?.length) {
    lines.push('## Warnings', '');
    r.warnings.forEach((w) => lines.push(`- ${w}`));
    lines.push('');
  }
  lines.push('## Dataset', '');
  const d = r.dataset ?? {};
  lines.push(`- Contains speech: ${d.contains_speech == null ? 'unknown' : d.contains_speech ? 'yes' : 'no'}`);
  lines.push(`- Audio source: ${(d.audio_sources ?? []).join(', ') || 'unknown'}`);
  lines.push(`- Samples evaluated: ${d.samples_evaluated ?? DASH}`);
  lines.push(`- References available: ${d.references_available == null ? 'unknown' : d.references_available ? 'yes' : 'no'}`);
  lines.push('', '## Results (measured)', '');
  lines.push('| Strategy | WER | SA-WER | Overlap WER (proxy) | Median latency | P95 latency | Separation rate | Regions | n |', '|---|---|---|---|---|---|---|---|---|');
  r.results.forEach((m) =>
    lines.push(
      `| ${cell(m.method_name)} | ${fmtPct(m.standard_wer)} | ${fmtPct(m.speaker_attributed_wer)} | ${fmtPct(m.overlap_wer)} | ${fmtMs(m.p50_latency_ms)} | ${fmtMs(m.p95_latency_ms)} | ${fmtPct(m.separation_invocation_rate)} | ${m.total_regions_processed} | ${m.evaluated_samples_count} |`,
    ),
  );
  if (r.not_evaluated && Object.keys(r.not_evaluated).length) {
    lines.push('', '## Not evaluated', '');
    Object.entries(r.not_evaluated).forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
  }
  lines.push('', '## Findings', '', r.summary_analysis);
  if (r.config?.definitions) {
    lines.push('', '## Metric definitions', '');
    Object.entries(r.config.definitions).forEach(([k, v]) => lines.push(`- **${k}**: ${v}`));
  }
  return lines.join('\n') + '\n';
}
