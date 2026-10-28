import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useWorkbench } from '../state/store';
import { Chip, DecisionBadge, EmptyState, InfoHint, KV, PageHeader, Provenance, Section, Segmented } from '../components/ui';
import { TraceList } from '../components/TraceList';
import { DECISION_LABEL, analyzeRegion } from '../lib/analysis';
import { fmtMs, fmtNum, fmtSec, titleCase } from '../lib/format';
import type { ReplayPolicy, RoutingDecision, RoutingStrategy } from '../types';

const REQUIRED = ['overlap_score', 'pitch_clash_index', 'baseline_avg_logprob', 'overlap_duration', 'normalized_cost', 'speaker_count_estimate'];

const FALLBACK_SPEC = {
  benefit: 'predicted_benefit = 0.05 if (pitch_clash_index < 0.30 and baseline_avg_logprob > −0.45) else sigmoid(−1.2 + 2.5·overlap_score + 2.5·pitch_clash_index + 0.8·uncertainty + 0.4·overlap_duration), with uncertainty = clip(−baseline_avg_logprob − 0.40, 0, 3)',
  cost: 'normalized_cost = clip((0.12·duration_s + 0.25) / 3.0, 0.05, 1.0)  (estimate, not measured)',
  utility: 'utility = predicted_benefit − λ · normalized_cost',
  rule: 'speaker_count ≥ 3 → review; utility > 0.05 → separate; utility < −0.15 → direct; otherwise separate only if baseline_avg_logprob ≤ −0.65',
};

const POLICY_ORDER: RoutingStrategy[] = ['never_separate', 'always_separate', 'threshold', 'benefit_aware'];
const POLICY_LABEL: Record<RoutingStrategy, string> = {
  never_separate: 'Mixture only',
  always_separate: 'Always separate',
  threshold: 'Threshold',
  benefit_aware: 'Benefit-aware',
};

function BenefitCostBars({ d, lambda }: { d: RoutingDecision; lambda: number }) {
  const penalty = lambda * d.normalized_cost;
  const rows = [
    { label: 'Predicted benefit', val: d.predicted_benefit, cls: 'bar-benefit', note: 'heuristic' },
    { label: `Latency penalty λ·cost`, val: penalty, cls: 'bar-cost', note: 'estimate' },
  ];
  const maxV = Math.max(1, penalty, d.predicted_benefit);
  return (
    <figure className="bars" aria-label="Benefit versus latency penalty">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track"><i className={r.cls} style={{ width: `${(r.val / maxV) * 100}%` }} /></span>
          <span className="mono bar-val">{r.val.toFixed(3)}</span>
          <Chip tone="neutral">{r.note}</Chip>
        </div>
      ))}
      <div className="bar-row">
        <span className="bar-label">Net utility</span>
        <span className="bar-track bar-track-signed">
          <i className={d.utility >= 0 ? 'bar-pos' : 'bar-neg'} style={{ width: `${(Math.min(Math.abs(d.utility), 1) / 1) * 50}%`, [d.utility >= 0 ? 'left' : 'right']: '50%' }} />
          <b className="bar-zero" />
        </span>
        <span className="mono bar-val">{d.utility.toFixed(3)}</span>
        <Chip tone="neutral">benefit − penalty</Chip>
      </div>
      <figcaption className="meta">Selected action: <DecisionBadge mode={d.decision} long /></figcaption>
    </figure>
  );
}

function Scatter({ decisions, lambda, selectedId, onSelect }: { decisions: RoutingDecision[]; lambda: number; selectedId: string | null; onSelect: (id: string) => void }) {
  const W = 520;
  const H = 280;
  const m = { l: 44, r: 14, t: 12, b: 38 };
  const pts = decisions.map((d) => ({ d, x: lambda * d.normalized_cost, y: d.predicted_benefit }));
  const xMax = Math.max(0.3, ...pts.map((p) => p.x)) * 1.15;
  const sx = (v: number) => m.l + (v / xMax) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - v * (H - m.t - m.b);
  const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * xMax);
  const lineY = (x: number) => Math.min(1, x + 0.05);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Predicted benefit against latency penalty for each region, with the separation decision boundary">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={m.l - 8} y={sy(t) + 4} textAnchor="end" className="tick">{t.toFixed(2)}</text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={t} x={sx(t)} y={H - m.b + 16} textAnchor="middle" className="tick">{t.toFixed(2)}</text>
        ))}
        <path d={`M ${sx(0)} ${sy(lineY(0))} L ${sx(xMax)} ${sy(lineY(xMax))}`} className="boundary" />
        <text x={sx(xMax) - 4} y={sy(lineY(xMax)) - 6} textAnchor="end" className="tick boundary-label">utility = 0.05</text>
        {pts.map(({ d, x, y }) => (
          <g key={d.region_id} className={`pt pt-${d.decision} ${d.region_id === selectedId ? 'is-selected' : ''}`} onClick={() => onSelect(d.region_id)} tabIndex={0} role="button" aria-label={`${d.region_id}: benefit ${y.toFixed(2)}, penalty ${x.toFixed(2)}, ${DECISION_LABEL[d.decision]}`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(d.region_id)}>
            <circle cx={sx(x)} cy={sy(y)} r={d.region_id === selectedId ? 7 : 5} />
            <text x={sx(x) + 9} y={sy(y) + 4} className="tick">{d.region_id}</text>
            <title>{`${d.region_id} · benefit ${y.toFixed(3)} · λ·cost ${x.toFixed(3)} · ${DECISION_LABEL[d.decision]}`}</title>
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="axis">Latency penalty λ · normalized cost (estimate)</text>
        <text transform={`translate(12 ${(H - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle" className="axis">Predicted benefit (heuristic)</text>
      </svg>
      <figcaption className="meta">
        Regions above the dashed line have utility above 0.05. Between utility −0.15 and 0.05 the rule falls back to the baseline log-probability, so points near the line can go either way. Both axes are model quantities, not measurements.
      </figcaption>
    </figure>
  );
}

export function RoutingLab() {
  const wb = useWorkbench();
  const { result, settings, setSettings } = wb;
  const [inspect, setInspect] = useState<RoutingStrategy>('benefit_aware');
  const [replay, setReplay] = useState<Record<string, RoutingDecision[]> | null>(null);
  const [replayErr, setReplayErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const decisions = result?.routing_decisions ?? [];
  const replayable = decisions.length > 0 && decisions.every((d) => REQUIRED.every((k) => k in d.features));
  const lambda = settings.lambdaParam;
  const theta = settings.threshold;

  useEffect(() => {
    if (!result || !replayable) {
      setReplay(null);
      setReplayErr(null);
      return;
    }
    const policies: ReplayPolicy[] = POLICY_ORDER.map((s) => ({ name: s, strategy: s, lambda_param: lambda, threshold: theta }));
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      api
        .replay(result.routing_decisions, policies)
        .then((r) => {
          if (!live) return;
          setReplay(Object.fromEntries(r.policies.map((p) => [p.policy.strategy, p.decisions])));
          setReplayErr(null);
        })
        .catch((e) => live && setReplayErr(e instanceof Error ? e.message : 'Replay failed'))
        .finally(() => live && setBusy(false));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [result, replayable, lambda, theta]);

  const analyses = useMemo(() => (result ? result.detected_overlaps.map((o) => analyzeRegion(result, o)) : []), [result]);
  const { setNavigator, selectRegion } = wb;
  useEffect(() => {
    if (analyses.length === 0) return;
    setNavigator((d) => {
      const i = analyses.findIndex((a) => a.region.region_id === wb.selectedRegionId);
      selectRegion(analyses[Math.min(analyses.length - 1, Math.max(0, (i < 0 ? (d > 0 ? -1 : analyses.length) : i) + d))].region.region_id);
    });
    return () => setNavigator(null);
  }, [analyses, wb.selectedRegionId, setNavigator, selectRegion]);

  if (!result) {
    return (
      <>
        <PageHeader eyebrow="03 — Route" title="Adaptive Routing Lab">
          Should a region be transcribed directly, or separated first? Inspect the evidence, the predicted benefit and the cost behind each decision.
        </PageHeader>
        <EmptyState title="No routing decisions yet" action={<button type="button" className="btn btn-primary" onClick={() => wb.navigate('studio')}>Open ASR Studio</button>}>
          Routing decisions are made per overlap region during transcription. Transcribe a recording, or open a saved run from the Overview.
        </EmptyState>
        <Section title="How the benefit-aware policy decides">
          <Formula spec={wb.health?.routing?.benefit_aware} />
        </Section>
      </>
    );
  }

  const primary = replay?.[inspect];
  const shownDecisions: RoutingDecision[] = primary ?? decisions;
  const usingReplay = !!primary;
  const sel = analyses.find((a) => a.region.region_id === wb.selectedRegionId) ?? analyses[0] ?? null;
  const selDecision = sel ? shownDecisions.find((d) => d.region_id === sel.region.region_id) : undefined;
  const runPolicy = result.config?.routing_strategy ?? result.config?.controller ?? 'unknown';
  const totals = (list: RoutingDecision[]) => {
    const sep = list.filter((d) => d.decision === 'ROUTE_SEPARATION');
    return { n: sep.length, est: sep.reduce((s, d) => s + (d.features.estimated_latency_sec ?? 0), 0) };
  };
  const measuredSep = result.separation_results?.reduce((s, r) => s + r.separation_duration_ms, 0) ?? 0;

  return (
    <>
      <PageHeader eyebrow="03 — Route" title="Adaptive Routing Lab">
        Should a region be transcribed directly, or separated first? Inspect the evidence, the predicted benefit and the cost behind each decision.
      </PageHeader>

      <div className="routing-top">
        <Section title="The decision" hint="Benefit and cost below are the rules implemented in the backend, shown as written.">
          <p className="lede-sm">
            Separation can recover words hidden by overlapping speakers, but costs extra processing time. The benefit-aware policy separates a region only when its
            <strong> predicted benefit</strong> exceeds a <strong>latency penalty</strong>. Neither quantity is calibrated, so treat them as a heuristic, not a forecast.
          </p>
          <Formula spec={wb.health?.routing?.benefit_aware} />
        </Section>

        <Section title="Policy parameters" hint="These also configure the next transcription in ASR Studio. The comparison below recomputes decisions on the backend from this run’s stored features.">
          <div className="field">
            <div className="field-head"><label>Latency penalty λ = {lambda.toFixed(2)}<InfoHint text="Weight on estimated latency cost in the benefit-aware utility. Recomputed server-side below." /></label></div>
            <input type="range" className="range" min={0} max={1.5} step={0.05} value={lambda} onChange={(e) => setSettings({ lambdaParam: parseFloat(e.target.value) })} />
          </div>
          <div className="field">
            <div className="field-head"><label>Overlap threshold θ = {theta.toFixed(2)}<InfoHint text="Threshold policy: separate when the detector’s overlap score is at least θ." /></label></div>
            <input type="range" className="range" min={0.1} max={0.9} step={0.05} value={theta} onChange={(e) => setSettings({ threshold: parseFloat(e.target.value) })} />
          </div>
          <KV rows={[{ k: 'Policy used in this run', v: titleCase(runPolicy) }, { k: 'λ / θ used in this run', v: `${fmtNum(result.config?.lambda_param, 2)} / ${fmtNum(result.config?.threshold, 2)}` }]} />
        </Section>
      </div>

      {decisions.length === 0 ? (
        <EmptyState title="No candidate regions in this recording">
          The detector found no overlap regions, so there was nothing to route. The whole recording used the mixture transcript at no separation cost.
        </EmptyState>
      ) : !replayable ? (
        <EmptyState title="This run can’t be replayed under other policies">
          It was routed by a fixed policy ({titleCase(runPolicy)}) that doesn’t store the acoustic and confidence evidence the other policies need. Re-run it with the Benefit-aware or Threshold policy in ASR Studio to compare policies here.
        </EmptyState>
      ) : (
        <>
          <Section
            title="Policy comparison on this recording"
            hint="Decision rules re-evaluated by the backend on the evidence stored for each region. Recognition output is not recomputed."
            actions={busy ? <span className="meta">Recomputing…</span> : undefined}
          >
            {replayErr && <p className="text-red">{replayErr}</p>}
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Region</th>
                    <th scope="col">Run result<br /><small>{titleCase(runPolicy)}</small></th>
                    {POLICY_ORDER.map((p) => (
                      <th scope="col" key={p}>{POLICY_LABEL[p]}<br /><small>{p === 'threshold' ? `θ ${theta.toFixed(2)}` : p === 'benefit_aware' ? `λ ${lambda.toFixed(2)}` : 'replayed'}</small></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={d.region_id} className={d.region_id === sel?.region.region_id ? 'is-selected' : ''} onClick={() => wb.selectRegion(d.region_id)}>
                      <th scope="row" className="mono">{d.region_id} <small className="dim">{d.start.toFixed(1)}–{d.end.toFixed(1)}s</small></th>
                      <td><DecisionBadge mode={d.decision} /></td>
                      {POLICY_ORDER.map((p) => {
                        const r = replay?.[p]?.find((x) => x.region_id === d.region_id);
                        return <td key={p}>{r ? <span className={r.decision !== d.decision ? 'differs' : ''}><DecisionBadge mode={r.decision} /></span> : <span className="dim">…</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Regions separated</th>
                    <td className="mono">{totals(decisions).n}</td>
                    {POLICY_ORDER.map((p) => <td key={p} className="mono">{replay?.[p] ? totals(replay[p]).n : '…'}</td>)}
                  </tr>
                  <tr>
                    <th scope="row">Separation latency</th>
                    <td className="mono">{result.separation_results?.length ? `${fmtMs(measuredSep)} measured` : 'none run'}</td>
                    {POLICY_ORDER.map((p) => <td key={p} className="mono dim">{replay?.[p] ? `≈ ${totals(replay[p]).est.toFixed(1)} s est.` : '…'}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="meta">
              Highlighted cells differ from what this run actually did. Those alternative decisions were not executed, so their recognition effect is unknown until you re-run the recording with that policy.
              The latency row mixes one measurement (this run) with model estimates (replayed policies).
            </p>
            <div className="side-actions">
              <button type="button" className="btn btn-line btn-sm" onClick={() => { if (inspect !== 'never_separate') setSettings({ adaptive: true, strategy: inspect }); else setSettings({ adaptive: false }); wb.navigate('studio'); }}>
                Use “{POLICY_LABEL[inspect]}” in ASR Studio
              </button>
            </div>
          </Section>

          <Section title="Decision inspector">
            <div className="inspect-bar">
              <span className="meta">Inspect policy</span>
              <Segmented label="Policy to inspect" value={inspect} onChange={setInspect} options={POLICY_ORDER.map((p) => ({ id: p, label: POLICY_LABEL[p] }))} />
            </div>
            <div className="decision-grid">
              <div className="decision-list" role="listbox" aria-label="Candidate regions">
                {analyses.map((a) => {
                  const d = shownDecisions.find((x) => x.region_id === a.region.region_id);
                  const on = a.region.region_id === sel?.region.region_id;
                  return (
                    <button key={a.region.region_id} type="button" role="option" aria-selected={on} className={`decision-item ${on ? 'is-selected' : ''}`} onClick={() => wb.selectRegion(a.region.region_id)}>
                      <span className="mono">{a.region.region_id}</span>
                      <span className="mono dim">{fmtSec(a.region.start)}–{fmtSec(a.region.end)}</span>
                      <DecisionBadge mode={d?.decision} />
                    </button>
                  );
                })}
              </div>

              {sel && selDecision && (
                <div className="decision-detail">
                  <h3 className="h-sm mono">{sel.region.region_id} · {fmtSec(sel.region.start)}–{fmtSec(sel.region.end)}</h3>
                  <dl className="decision-fields">
                    <div><dt>Observed evidence</dt><dd>
                      Overlap score <b className="mono">{sel.region.overlap_score.toFixed(3)}</b>, pitch clash <b className="mono">{sel.region.pitch_clash_index.toFixed(3)}</b>, duration <b className="mono">{sel.region.duration.toFixed(2)} s</b> <Provenance kind="heuristic" />
                    </dd></div>
                    <div><dt>Baseline</dt><dd>
                      {sel.baselineSegments.length ? sel.baselineSegments.map((s) => <q key={s.id}>{s.text}</q>) : <span className="dim">no mixture text in this region</span>}
                      <br />avg log-prob <b className="mono">{fmtNum(selDecision.features.baseline_avg_logprob, 3)}</b>, confidence <b className="mono">{fmtNum(selDecision.features.baseline_confidence, 3)}</b> <Provenance kind="measured" />
                    </dd></div>
                    <div><dt>Expected benefit</dt><dd>
                      <b className="mono">{selDecision.predicted_benefit.toFixed(3)}</b> <Chip tone="accent" title="Output of a hand-set heuristic; not validated against measured WER gains.">Predicted · uncalibrated</Chip>
                    </dd></div>
                    <div><dt>Processing cost</dt><dd>
                      normalized <b className="mono">{selDecision.normalized_cost.toFixed(3)}</b> (≈ <b className="mono">{fmtNum(selDecision.features.estimated_latency_sec, 2)} s</b>) <Provenance kind="estimate" />
                      <br />{sel.separation ? <>measured in this run: <b className="mono">{fmtMs(sel.separation.separation_duration_ms)}</b> <Provenance kind="measured" /></> : <span className="dim">not measured (separation did not run for this region)</span>}
                    </dd></div>
                    <div><dt>Decision{usingReplay ? ` (${POLICY_LABEL[inspect]}, replayed)` : ''}</dt><dd><DecisionBadge mode={selDecision.decision} long />
                      {sel.decision && sel.decision.decision !== selDecision.decision && <span className="meta"> · the run itself chose “{DECISION_LABEL[sel.decision.decision]}”</span>}
                    </dd></div>
                    <div><dt>Explanation</dt><dd>{selDecision.rationale}</dd></div>
                  </dl>
                  {inspect === 'benefit_aware' && <BenefitCostBars d={selDecision} lambda={lambda} />}
                </div>
              )}
            </div>
          </Section>

          {inspect === 'benefit_aware' && primary && (
            <Section title="Benefit versus cost" hint="Each point is a region. Position is the model’s predicted benefit against its λ-weighted latency estimate.">
              <Scatter decisions={primary} lambda={lambda} selectedId={sel?.region.region_id ?? null} onSelect={wb.selectRegion} />
            </Section>
          )}
        </>
      )}

      <Section title="Decision trace" hint="Events are recorded by the backend while the pipeline ran, with their own timestamps.">
        <TraceList trace={result.trace} regionId={wb.selectedRegionId} />
        {wb.selectedRegionId && <p className="meta">Filtered to {wb.selectedRegionId} plus global steps. <button type="button" className="link-btn" onClick={() => wb.selectRegion(null)}>Show all events</button></p>}
      </Section>
    </>
  );
}

function Formula({ spec }: { spec?: { benefit: string; cost: string; utility: string; rule: string } }) {
  const s = spec ?? FALLBACK_SPEC;
  return (
    <dl className="formula">
      <div><dt>Benefit</dt><dd className="mono">{s.benefit}</dd></div>
      <div><dt>Cost</dt><dd className="mono">{s.cost}</dd></div>
      <div><dt>Utility</dt><dd className="mono">{s.utility}</dd></div>
      <div><dt>Rule</dt><dd className="mono">{s.rule}</dd></div>
    </dl>
  );
}
