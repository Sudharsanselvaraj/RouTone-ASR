import { useWorkbench } from '../state/store';
import { fmtMs, fmtPct } from '../lib/format';

const SKELETON = ['Mixture only', 'Always separate', 'Threshold', 'Benefit-aware'];
const short = (n: string) => n.replace(/\s*\(.*\)/, '');

/** Landing-page evaluation panel. Every number comes from the saved benchmark; with none, it shows a labelled empty state. */
export function EvaluationSection({ onOpen }: { onOpen: () => void }) {
  const wb = useWorkbench();
  const b = wb.benchmark;
  const rows = b ? b.results.filter((r) => r.valid !== false && r.evaluated_samples_count > 0) : [];
  const maxLat = Math.max(1, ...rows.map((r) => r.p50_latency_ms));
  const status = b?.status ?? (b ? 'unknown' : null);
  const samples = b?.dataset?.samples_evaluated ?? b?.results[0]?.evaluated_samples_count;
  const note = b ? (b.warnings ?? []).find((w) => /sample|speech|identical/i.test(w)) : null;

  return (
    <section id="evaluation" className="parley-section ev">
      <div className="ev-head">
        <span className="parley-eyebrow">Evaluation</span>
        <h2 className="parley-section-title">
          Claims follow the data. <br />
          <span className="parley-serif-italic">Nothing is shown that wasn’t measured.</span>
        </h2>
        <p className="parley-section-lead center">
          Every strategy is scored on the same recordings, and each experiment says whether it is valid.
        </p>
      </div>

      <div className="ev-panel">
        <div className="ev-stage">
          <div className="ev-side">
            <span className="ev-kicker">Latest saved benchmark</span>
            <h3>{b ? b.dataset_name.replace(/\s*\(.*\)/, '') : 'No benchmark loaded'}</h3>
            {status && (
              <span className={`ev-status ev-${status}`}>
                <i /> {status === 'unknown' ? 'validity not recorded' : status}
              </span>
            )}
            <dl className="ev-stats">
              <div><dt>Strategies</dt><dd>{b ? b.results.length : '—'}</dd></div>
              <div><dt>Recordings</dt><dd>{samples ?? '—'}</dd></div>
              <div><dt>Not evaluated</dt><dd>{b ? Object.keys(b.not_evaluated ?? {}).length : '—'}</dd></div>
            </dl>
            <p className="ev-note">
              {b
                ? note ?? 'No integrity warnings were recorded for this run.'
                : wb.backend === 'offline'
                  ? 'Start the API (make server) to load the latest saved run.'
                  : 'Run a benchmark to see real results here.'}
            </p>
          </div>

          <div className="ev-card">
            <div className="ev-card-head"><i /> STRATEGY COMPARISON</div>
            <ul>
              {(rows.length ? rows.map((r) => r.method_name) : SKELETON).map((name, i) => {
                const r = rows[i];
                return (
                  <li key={name} style={{ ['--r' as string]: i }}>
                    <span className="ev-name">{short(name)}</span>
                    <span className={`ev-bar ${r ? '' : 'is-empty'}`} aria-hidden="true">
                      <i style={{ width: r ? `${Math.max(6, (r.p50_latency_ms / maxLat) * 100)}%` : '45%' }} />
                    </span>
                    <span className="ev-val">
                      {r ? <><b>{fmtPct(r.speaker_attributed_wer)}</b><small>{fmtMs(r.p50_latency_ms)}</small></> : <small>—</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="ev-legend">
              {rows.length
                ? 'Bar length is median latency per recording. Figures are speaker-attributed WER and median latency, both measured.'
                : 'Bars show median latency per strategy once a benchmark has run.'}
            </p>
          </div>
        </div>
      </div>

      <div className="ev-cta">
        <button onClick={onOpen} className="parley-btn">
          <span className="parley-btn-icon">›</span>
          <span className="parley-btn-label">Open Benchmarks</span>
        </button>
      </div>
    </section>
  );
}
