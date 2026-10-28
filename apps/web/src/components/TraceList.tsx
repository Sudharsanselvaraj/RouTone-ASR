import type { TraceEvent } from '../types';
import { fmtMs } from '../lib/format';

const LABEL: Record<string, string> = {
  audio_loaded: 'Audio loaded',
  baseline_asr: 'Mixture ASR executed',
  overlap_detection: 'Overlap detection',
  region_analyzed: 'Region analyzed',
  routing_decision: 'Routing decision made',
  separation_started: 'Separation started',
  separation_finished: 'Separation finished',
  asr_stream_a: 'ASR executed · stream A',
  asr_stream_b: 'ASR executed · stream B',
  reconciliation: 'Transcript reconciliation',
  pipeline_complete: 'Pipeline complete',
};

export function TraceList({ trace, regionId }: { trace: TraceEvent[] | undefined; regionId?: string | null }) {
  if (!trace || trace.length === 0) {
    return <p className="meta">This run has no recorded trace (it predates trace recording). No sequence is shown rather than inventing one.</p>;
  }
  const rows = regionId ? trace.filter((e) => !e.region_id || e.region_id === regionId) : trace;
  return (
    <div className="table-scroll">
      <table className="table trace-table">
        <thead>
          <tr>
            <th scope="col">t (ms)</th>
            <th scope="col">Event</th>
            <th scope="col">Region</th>
            <th scope="col">Step time</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i}>
              <td className="mono num">{e.t_ms.toFixed(0)}</td>
              <td>{LABEL[e.event] ?? e.event}</td>
              <td className="mono">{e.region_id ?? '—'}</td>
              <td className="mono num">{e.duration_ms == null ? '—' : fmtMs(e.duration_ms, 0)}</td>
              <td className="detail">{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
