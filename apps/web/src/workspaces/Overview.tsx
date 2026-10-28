import { useState } from 'react';
import { ArrowRight, GitCompare, FolderOpen } from 'lucide-react';
import { useWorkbench } from '../state/store';
import { RecordingPanel } from '../components/RecordingPanel';
import { Chip, EmptyState, PageHeader, Section } from '../components/ui';
import { CompareDialog } from './CompareDialog';
import { fmtDateTime, fmtNum, fmtSec, titleCase } from '../lib/format';

export function Overview() {
  const wb = useWorkbench();
  const [picked, setPicked] = useState<string[]>([]);
  const r = wb.result;

  const steps = [
    { n: '01', name: 'Recognize', view: 'studio' as const, text: 'Transcribe audio and inspect word-level output.', live: r ? `${r.final_transcript.length} final segment(s)` : 'No transcript yet' },
    { n: '02', name: 'Inspect', view: 'inspector' as const, text: 'Examine overlapping regions and speaker attribution.', live: r ? `${r.detected_overlaps.length} candidate region(s)` : 'Needs a transcription' },
    { n: '03', name: 'Route', view: 'routing' as const, text: 'Compare selective separation against alternative processing strategies.', live: r ? `${r.metrics.separated_regions_count} routed to separation` : 'Needs a transcription' },
    { n: '04', name: 'Evaluate', view: 'benchmarks' as const, text: 'Measure recognition accuracy and computational cost.', live: wb.benchmark ? `Last benchmark: ${wb.benchmark.status ?? 'legacy report'}` : wb.benchmarkLoaded ? 'No benchmark run yet' : '…' },
  ];

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]));

  return (
    <>
      <PageHeader
        eyebrow="Routone"
        title={<>Speech research, <em>with routing in control.</em></>}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => wb.navigate('studio')}>Open ASR Studio</button>
            <button type="button" className="btn btn-line" onClick={() => wb.navigate('routing')}>Explore Routing Lab</button>
          </>
        }
      >
        Explore mixed speech, inspect recognition results, and evaluate when separation is worth its computational cost.
      </PageHeader>

      <Section title="Audio workspace" hint="This is the same recording and result the other workspaces use.">
        <RecordingPanel variant="overview" />
      </Section>

      <Section title="Research workflow">
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.n}>
              <button type="button" className="step" onClick={() => wb.navigate(s.view)}>
                <span className="step-n mono">{s.n}</span>
                <strong>{s.name}</strong>
                <span className="step-text">{s.text}</span>
                <span className="step-live">{s.live}</span>
                <ArrowRight size={15} className="step-arrow" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Recent activity"
        hint="Every transcription is saved on the server. Open one to inspect its audio, transcript, routing decisions and trace together."
        actions={
          <button type="button" className="btn btn-quiet btn-sm" disabled={picked.length !== 2} onClick={() => wb.setCompareOpen(true)} title={picked.length === 2 ? 'Compare the two selected runs' : 'Select two runs to compare'}>
            <GitCompare size={14} aria-hidden="true" /> Compare selected ({picked.length}/2)
          </button>
        }
      >
        {!wb.runsLoaded ? (
          <p className="meta">Loading history…</p>
        ) : wb.runs.length === 0 ? (
          <EmptyState title="No experiments yet" icon={<FolderOpen size={22} />}>
            Load a demo, upload audio or record from the microphone, then press Transcribe. Each run is saved here with its configuration, result and trace.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Select</span></th>
                  <th scope="col">When</th>
                  <th scope="col">Recording</th>
                  <th scope="col" className="num">Duration</th>
                  <th scope="col" className="num">Regions</th>
                  <th scope="col" className="num">Separated</th>
                  <th scope="col" className="num">RTF</th>
                  <th scope="col">Config</th>
                  <th scope="col"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {wb.runs.slice(0, 12).map((run) => (
                  <tr key={run.id}>
                    <td>
                      <input type="checkbox" aria-label={`Select ${run.filename} for comparison`} checked={picked.includes(run.id)} onChange={() => toggle(run.id)} />
                    </td>
                    <td>{fmtDateTime(run.created_at)}</td>
                    <td className="file-cell" title={run.filename}>{run.filename}</td>
                    <td className="mono num">{fmtSec(run.duration_s)}</td>
                    <td className="mono num">{run.overlap_regions}</td>
                    <td className="mono num">{run.separated_regions ?? '—'}</td>
                    <td className="mono num">{fmtNum(run.real_time_factor, 2)}</td>
                    <td><Chip>{run.config.asr_model ?? '—'}</Chip> <Chip>{titleCase(run.config.routing_strategy ?? 'unknown')}</Chip></td>
                    <td><button type="button" className="btn btn-quiet btn-sm" disabled={wb.operation.kind !== 'idle'} onClick={() => void wb.openRun(run.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {wb.benchmarkHistory.length > 0 && (
          <p className="meta">
            {wb.benchmarkHistory.length} benchmark run(s) saved. <button type="button" className="link-btn" onClick={() => wb.navigate('benchmarks')}>View in Benchmarks</button>
          </p>
        )}
      </Section>
      {wb.compareOpen && picked.length === 2 && <CompareDialog ids={[picked[0], picked[1]]} onClose={() => wb.setCompareOpen(false)} />}
    </>
  );
}
