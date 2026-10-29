import { useMemo, useState } from 'react';
import { Download, FileText, FileJson, Play } from 'lucide-react';
import { API_BASE } from '../api';
import { useWorkbench } from '../state/store';
import { Banner, Chip, EmptyState, InfoHint, KV, PageHeader, Section, Spinner } from '../components/ui';
import { downloadText } from '../lib/export';
import { buildBenchmarkReport } from '../lib/report';
import { fmtDateTime, fmtMs, fmtPct, DASH } from '../lib/format';
import type { BenchmarkReport, BenchmarkStatus, EvaluationMetricSummary } from '../types';

const STATUS_TONE: Record<BenchmarkStatus, 'green' | 'amber' | 'red' | 'neutral'> = { valid: 'green', incomplete: 'amber', invalid: 'red', unknown: 'neutral' };

/** Reports written before integrity checks existed carry no status; derive observable red flags. */
function legacyFlags(r: BenchmarkReport): string[] {
  const flags: string[] = [];
  if (r.results.every((m) => m.speaker_attributed_wer >= 0.999 && m.standard_wer >= 0.999)) flags.push('Every method scores 100% WER, which means nothing was recognized.');
  if (r.results.every((m) => m.total_regions_processed === 0)) flags.push('No overlap regions were detected for any method, so routing never had a choice to make.');
  return flags;
}

function niceTicks(max: number, n = 5): number[] {
  const raw = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  // Always end on the first tick at or above `max`, so every plotted value lies inside the axis.
  for (let k = 0; ; k++) {
    const v = Number((k * step).toFixed(6));
    out.push(v);
    if (v >= max) break;
  }
  return out;
}

function ShortName(n: string): string {
  return n.replace(/\s*\(.*\)/, '');
}

function TradeoffPlot({ report, hidden }: { report: BenchmarkReport; hidden: string | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const pts = report.results.filter((m) => m.valid !== false && m.evaluated_samples_count > 0);
  const W = 640;
  const H = 320;
  const m = { l: 56, r: 24, t: 16, b: 46 };
  const xMaxRaw = Math.max(...pts.map((p) => p.p50_latency_ms), 1);
  const yMaxRaw = Math.max(1, ...pts.map((p) => p.speaker_attributed_wer));
  const xt = niceTicks(xMaxRaw * 1.1);
  const yt = niceTicks(yMaxRaw * 1.05);
  const xMax = xt[xt.length - 1];
  const yMax = yt[yt.length - 1];
  const sx = (v: number) => m.l + (v / xMax) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - (v / yMax) * (H - m.t - m.b);
  const front = new Set(report.pareto_front ?? []);
  const frontPts = pts.filter((p) => front.has(p.method_name)).sort((a, b) => a.p50_latency_ms - b.p50_latency_ms);
  const h = pts.find((p) => p.method_name === hover);

  if (hidden) return <EmptyState title="Plot withheld">{hidden}</EmptyState>;
  if (pts.length === 0) return <EmptyState title="Nothing to plot">No strategy has a valid measurement.</EmptyState>;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Speaker-attributed WER versus median latency for each evaluated strategy">
        {yt.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={m.l - 8} y={sy(t) + 4} textAnchor="end" className="tick">{(t * 100).toFixed(0)}%</text>
          </g>
        ))}
        {xt.map((t) => (
          <g key={t}>
            <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={H - m.b} className="grid grid-v" />
            <text x={sx(t)} y={H - m.b + 16} textAnchor="middle" className="tick">{t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)} s` : `${t} ms`}</text>
          </g>
        ))}
        {frontPts.length > 1 && <polyline className="front" fill="none" points={frontPts.map((p) => `${sx(p.p50_latency_ms)},${sy(p.speaker_attributed_wer)}`).join(' ')} />}
        {pts.map((p) => (
          <g key={p.method_name} className={`pt ${front.has(p.method_name) ? 'is-front' : ''} ${hover === p.method_name ? 'is-selected' : ''}`} tabIndex={0} onMouseEnter={() => setHover(p.method_name)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p.method_name)} onBlur={() => setHover(null)}>
            <circle cx={sx(p.p50_latency_ms)} cy={sy(p.speaker_attributed_wer)} r={6} />
            <text x={sx(p.p50_latency_ms) + 10} y={sy(p.speaker_attributed_wer) + 4} className="tick">{ShortName(p.method_name)}</text>
            <title>{`${p.method_name}: SA-WER ${fmtPct(p.speaker_attributed_wer)}, median ${fmtMs(p.p50_latency_ms)} (n=${p.evaluated_samples_count})`}</title>
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="axis">Median latency per recording (lower is faster)</text>
        <text transform={`translate(14 ${(H - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle" className="axis">Speaker-attributed WER (lower is better)</text>
      </svg>
      <figcaption className="meta" aria-live="polite">
        {h
          ? `${h.method_name}: SA-WER ${fmtPct(h.speaker_attributed_wer)} · median latency ${fmtMs(h.p50_latency_ms)} · n=${h.evaluated_samples_count}`
          : 'Hover or focus a point for its values. A connected line marks strategies that no other strategy beats on both axes, among those measured here.'}
      </figcaption>
    </figure>
  );
}

function Cell({ v, na, title }: { v: string; na?: boolean; title?: string }) {
  return <td className={`mono num ${na ? 'dim' : ''}`} title={na ? 'Unavailable' : title}>{na ? DASH : v}</td>;
}

function ResultsTable({ report }: { report: BenchmarkReport }) {
  const front = new Set(report.status === 'invalid' ? [] : report.pareto_front ?? []);
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Strategy</th>
            <th scope="col" className="num">WER<InfoHint text="Concatenated final transcript vs. both speakers’ references; speaker labels ignored." /></th>
            <th scope="col" className="num">SA-WER<InfoHint text="Per-speaker edit distance over total reference words, grouped by predicted speaker label (no permutation search)." /></th>
            <th scope="col" className="num">Overlap WER<InfoHint text="Proxy: Speaker 2’s full reference vs. text intersecting the planted overlap window. Not a time-aligned region WER." /></th>
            <th scope="col" className="num">Median latency</th>
            <th scope="col" className="num">P95 latency</th>
            <th scope="col" className="num">Separation rate<InfoHint text="Regions separated / regions detected. Unavailable when no region was detected." /></th>
            <th scope="col" className="num">Regions</th>
            <th scope="col" className="num">n</th>
          </tr>
        </thead>
        <tbody>
          {report.results.map((r: EvaluationMetricSummary) => {
            const bad = r.valid === false || r.evaluated_samples_count === 0;
            return (
              <tr key={r.method_name} className={bad ? 'is-muted' : ''}>
                <th scope="row">
                  {r.method_name}
                  {front.has(r.method_name) && <Chip tone="accent" title="Not dominated on (SA-WER, median latency) by any other measured strategy">non-dominated</Chip>}
                  {bad && <Chip tone="red">no valid result</Chip>}
                </th>
                <Cell v={fmtPct(r.standard_wer)} na={bad} />
                <Cell v={fmtPct(r.speaker_attributed_wer)} na={bad} />
                <Cell v={fmtPct(r.overlap_wer)} na={bad} />
                <Cell v={fmtMs(r.p50_latency_ms)} na={r.evaluated_samples_count === 0} />
                <Cell v={fmtMs(r.p95_latency_ms)} na={r.evaluated_samples_count === 0} title={`95th percentile over ${r.evaluated_samples_count} run(s)`} />
                <Cell v={fmtPct(r.separation_invocation_rate)} na={r.separation_invocation_rate == null || r.total_regions_processed === 0} />
                <Cell v={String(r.total_regions_processed)} />
                <Cell v={String(r.evaluated_samples_count)} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Benchmarks() {
  const wb = useWorkbench();
  const { benchmark: report } = wb;
  const [dataset, setDataset] = useState('auto');
  const running = wb.operation.kind === 'benchmark';
  const status: BenchmarkStatus = report?.status ?? 'unknown';
  const flags = useMemo(() => (report && !report.status ? legacyFlags(report) : []), [report]);
  const viewingLatest = wb.viewingBenchmarkId == null;

  const header = (
    <PageHeader eyebrow="04 — Evaluate" title="Benchmarks & Evaluation" actions={report ? (
      <>
        <button type="button" className="btn btn-line btn-sm" onClick={() => downloadText('routone_benchmark_report.md', buildBenchmarkReport(report), 'text/markdown')}><FileText size={13} aria-hidden="true" /> Report (.md)</button>
        <button type="button" className="btn btn-line btn-sm" onClick={() => downloadText('routone_benchmark.json', JSON.stringify(report, null, 2), 'application/json')}><FileJson size={13} aria-hidden="true" /> JSON</button>
        {viewingLatest && <a className="btn btn-line btn-sm" href={`${API_BASE}/results/benchmarks.csv`} download="benchmarks.csv"><Download size={13} aria-hidden="true" /> CSV</a>}
      </>
    ) : undefined}>
      Measure recognition accuracy and computational cost for each routing strategy, and see exactly how trustworthy the experiment is.
    </PageHeader>
  );

  const runPanel = (
    <Section title="Run an experiment" hint="Runs every strategy over the selected dataset, one full pipeline pass per recording, after a discarded warm-up pass.">
      <div className="run-controls">
        <label className="field-inline-label">
          Dataset
          <select className="input" value={dataset} onChange={(e) => setDataset(e.target.value)} disabled={running}>
            <option value="auto">Auto: speech mixtures when available</option>
            <option value="tts">Text-to-speech overlap mixtures (macOS)</option>
            <option value="synthetic">Harmonic tones (no speech; diagnostic only)</option>
          </select>
        </label>
        <button type="button" className="btn btn-primary" disabled={running || wb.backend !== 'online'} onClick={() => void wb.runBenchmark(dataset)}>
          <Play size={14} aria-hidden="true" /> {running ? 'Running…' : 'Run benchmark'}
        </button>
        {running && <Spinner label="Evaluating all strategies. This takes about a minute and can’t be interrupted." />}
      </div>
      <p className="meta">Uses the λ and θ from your policy parameters (λ {wb.settings.lambdaParam.toFixed(2)}, θ {wb.settings.threshold.toFixed(2)}). The ASR model is whichever the server has loaded.</p>
    </Section>
  );

  if (!report) {
    return (
      <>
        {header}
        {wb.benchmarkLoaded ? (
          <EmptyState title="No benchmark has been run yet">Run the evaluation below. Nothing is shown until real measurements exist.</EmptyState>
        ) : (
          <Spinner label="Loading saved benchmark" />
        )}
        {runPanel}
      </>
    );
  }

  const d = report.dataset ?? {};
  const hiddenPlot = status === 'invalid' ? 'The plot is withheld because this experiment is invalid: its accuracy numbers would not be meaningful to compare.' : flags.length ? 'The plot is withheld because this legacy report shows signs of an invalid experiment.' : null;
  const evaluated = report.results.map((r) => r.method_name);

  return (
    <>
      {header}

      {!viewingLatest && (
        <Banner tone="neutral" title={`Viewing a past run (${fmtDateTime(report.timestamp)})`}>
          <button type="button" className="link-btn" onClick={() => void wb.viewBenchmark(null)}>Back to the latest run</button>
        </Banner>
      )}

      {status === 'invalid' && (
        <Banner tone="red" title="Invalid experiment: these results support no conclusion">
          <ul className="notes">{(report.warnings ?? []).filter((w) => !/Only \d+ sample/.test(w)).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Banner>
      )}
      {status === 'incomplete' && (
        <Banner tone="amber" title="Incomplete experiment">
          <ul className="notes">{(report.warnings ?? []).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Banner>
      )}
      {status === 'valid' && (report.warnings ?? []).length > 0 && (
        <Banner tone="neutral" title="Valid run, with caveats">
          <ul className="notes">{(report.warnings ?? []).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Banner>
      )}
      {status === 'unknown' && (
        <Banner tone={flags.length ? 'red' : 'amber'} title="Legacy report without integrity metadata">
          This file predates the integrity checks, so its validity can’t be certified.
          {flags.length > 0 && <ul className="notes">{flags.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          Re-run the benchmark to produce a report with validity checks.
        </Banner>
      )}

      <Section title="Experiment configuration">
        <div className="config-grid">
          <KV
            rows={[
              { k: 'Dataset', v: report.dataset_name },
              { k: 'Audio source', v: (d.audio_sources ?? []).join(', ') || 'not recorded' },
              { k: 'Contains speech', v: d.contains_speech == null ? 'unknown' : d.contains_speech ? 'yes' : 'no', tag: d.contains_speech === false ? <Chip tone="red">references are not spoken</Chip> : undefined },
              { k: 'Samples evaluated', v: d.samples_evaluated != null ? `${d.samples_evaluated} of ${d.samples_total}` : String(report.results[0]?.evaluated_samples_count ?? DASH) },
              { k: 'Reference transcripts', v: d.references_available == null ? 'unknown' : d.references_available ? `available · ${d.reference_words} words` : 'unavailable' },
            ]}
          />
          <KV
            rows={[
              { k: 'ASR model', v: report.config?.asr_model ?? 'not recorded' },
              { k: 'Benefit-aware λ', v: report.config?.lambda_param?.toFixed(2) ?? 'not recorded' },
              { k: 'Threshold θ', v: report.config?.threshold?.toFixed(2) ?? 'not recorded' },
              { k: 'Run at', v: fmtDateTime(report.timestamp) },
              { k: 'Strategies evaluated', v: evaluated.map(ShortName).join(', ') },
            ]}
          />
        </div>
        {report.not_evaluated && Object.keys(report.not_evaluated).length > 0 && (
          <ul className="notes">
            {Object.entries(report.not_evaluated).map(([k, v]) => <li key={k}><strong>{ShortName(k)} not evaluated:</strong> {v}</li>)}
          </ul>
        )}
        {report.config?.definitions && (
          <details className="disclosure disclosure-inline">
            <summary>Scoring definitions</summary>
            <div className="disclosure-body">
              <dl className="formula">
                {Object.entries(report.config.definitions).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{v}</dd></div>)}
              </dl>
            </div>
          </details>
        )}
      </Section>

      <Section title="Strategy comparison" hint="Only strategies that were actually evaluated appear. “—” means unavailable, never zero.">
        <ResultsTable report={report} />
      </Section>

      <Section title="Accuracy versus latency">
        <TradeoffPlot report={report} hidden={hiddenPlot} />
      </Section>

      <Section title="Findings" hint="Generated from the measurements above. It states what was measured and flags what can’t be concluded.">
        <p className="findings">{report.summary_analysis}</p>
        {report.results.some((r) => r.notes?.length) && (
          <ul className="notes">
            {report.results.flatMap((r) => (r.notes ?? []).map((n, i) => <li key={`${r.method_name}${i}`}><strong>{ShortName(r.method_name)}:</strong> {n}</li>))}
          </ul>
        )}
      </Section>

      {runPanel}

      <Section title="Experiment history" hint="Every benchmark run is saved with its configuration and status.">
        {wb.benchmarkHistory.length === 0 ? (
          <p className="meta">No saved runs yet. Runs made before history was added are not listed.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th scope="col">Run</th><th scope="col">Dataset</th><th scope="col">Status</th><th scope="col" className="num">Samples</th><th scope="col" className="num">Strategies</th><th scope="col"><span className="sr-only">View</span></th></tr></thead>
              <tbody>
                {wb.benchmarkHistory.map((h) => (
                  <tr key={h.id} className={wb.viewingBenchmarkId === h.id ? 'is-selected' : ''}>
                    <td>{fmtDateTime(h.timestamp)}</td>
                    <td className="file-cell" title={h.dataset_name}>{h.dataset_name}</td>
                    <td><Chip tone={STATUS_TONE[h.status] ?? 'neutral'}>{h.status}</Chip></td>
                    <td className="mono num">{h.samples ?? DASH}</td>
                    <td className="mono num">{h.strategies.length}</td>
                    <td><button type="button" className="btn btn-quiet btn-sm" onClick={() => void wb.viewBenchmark(h.id)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
