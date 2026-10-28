import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useWorkbench } from '../state/store';
import { Timeline } from '../components/Timeline';
import type { Lane } from '../components/Timeline';
import { RegionCompare } from '../components/RegionCompare';
import { Chip, DecisionBadge, EmptyState, KV, PageHeader, Provenance, Section } from '../components/ui';
import { OUTCOME_LABEL, analyzeRegion, reconciliationAudit } from '../lib/analysis';
import type { RegionAnalysis } from '../lib/analysis';
import { speakerColor } from '../lib/speakers';
import { fmtClock, fmtMs, fmtNum, fmtSec } from '../lib/format';
import type { PipelineResult, RoutingMode } from '../types';

type SortKey = 'region' | 'start' | 'duration' | 'score' | 'clash' | 'logprob' | 'benefit';

function value(a: RegionAnalysis, k: SortKey): number {
  const f = a.decision?.features ?? {};
  switch (k) {
    case 'region': return parseInt(a.region.region_id.replace(/\D/g, ''), 10) || 0;
    case 'start': return a.region.start;
    case 'duration': return a.region.duration;
    case 'score': return a.region.overlap_score;
    case 'clash': return a.region.pitch_clash_index;
    case 'logprob': return f.baseline_avg_logprob ?? -Infinity;
    case 'benefit': return a.decision?.predicted_benefit ?? -Infinity;
  }
}

function RegionTable({ rows, selectedId, onSelect }: { rows: RegionAnalysis[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const wb = useWorkbench();
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'start', dir: 1 });
  const [filter, setFilter] = useState<'all' | RoutingMode>('all');
  const shown = useMemo(
    () =>
      rows
        .filter((a) => filter === 'all' || a.decision?.decision === filter)
        .sort((x, y) => (value(x, sort.k) - value(y, sort.k)) * sort.dir),
    [rows, sort, filter],
  );

  const { setNavigator } = wb;
  useEffect(() => {
    if (shown.length === 0) return;
    setNavigator((d) => {
      const i = shown.findIndex((a) => a.region.region_id === selectedId);
      const next = shown[Math.min(shown.length - 1, Math.max(0, (i < 0 ? (d > 0 ? -1 : shown.length) : i) + d))];
      onSelect(next.region.region_id);
    });
    return () => setNavigator(null);
  }, [shown, selectedId, onSelect, setNavigator]);

  const th = (k: SortKey, label: string, num = true) => (
    <th scope="col" className={num ? 'num' : ''} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-btn" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  return (
    <>
      <div className="table-tools">
        <label className="meta">
          Decision{' '}
          <select className="input input-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All ({rows.length})</option>
            <option value="ROUTE_SEPARATION">Separate</option>
            <option value="KEEP_MIXTURE">Direct</option>
            <option value="FLAG_REVIEW">Review</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table className="table table-select">
          <thead>
            <tr>
              {th('region', 'Region', false)}
              {th('start', 'Start')}
              <th scope="col" className="num">End</th>
              {th('duration', 'Dur.')}
              {th('score', 'Overlap score')}
              {th('clash', 'Pitch clash')}
              {th('logprob', 'Baseline logprob')}
              {th('benefit', 'Pred. benefit')}
              <th scope="col">Decision</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => {
              const sel = a.region.region_id === selectedId;
              return (
                <tr key={a.region.region_id} className={sel ? 'is-selected' : ''} onClick={() => onSelect(a.region.region_id)}>
                  <th scope="row">
                    <button type="button" className="row-btn mono" aria-pressed={sel} onClick={(e) => { e.stopPropagation(); onSelect(a.region.region_id); }}>
                      {a.region.region_id}
                    </button>
                  </th>
                  <td className="mono num">{a.region.start.toFixed(2)}</td>
                  <td className="mono num">{a.region.end.toFixed(2)}</td>
                  <td className="mono num">{a.region.duration.toFixed(2)}</td>
                  <td className="mono num">{a.region.overlap_score.toFixed(3)}</td>
                  <td className="mono num">{a.region.pitch_clash_index.toFixed(3)}</td>
                  <td className="mono num">{fmtNum(a.decision?.features.baseline_avg_logprob, 2)}</td>
                  <td className="mono num">{fmtNum(a.decision?.predicted_benefit, 3)}</td>
                  <td><DecisionBadge mode={a.decision?.decision} /></td>
                  <td className="outcome-cell">{OUTCOME_LABEL[a.outcome]}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={10} className="meta">No regions match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="meta">Overlap score and pitch clash come from a heuristic acoustic detector; predicted benefit is an uncalibrated heuristic. Sort with the column headers; ↑/↓ moves between regions.</p>
    </>
  );
}

function RegionDetail({ a }: { a: RegionAnalysis }) {
  const wb = useWorkbench();
  const f = a.decision?.features ?? {};
  return (
    <div className="region-detail">
      <div className="region-detail-head">
        <div>
          <h3 className="h-sm mono">{a.region.region_id}</h3>
          <span className="meta mono">{fmtSec(a.region.start)} → {fmtSec(a.region.end)}</span>
        </div>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => wb.playback.playRange(a.region.start, a.region.end)}>
          <Play size={13} aria-hidden="true" /> Play region
        </button>
      </div>

      <h4 className="h-xs">Measured from the signal and ASR</h4>
      <KV
        rows={[
          { k: 'Start / end', v: `${a.region.start.toFixed(3)} / ${a.region.end.toFixed(3)} s` },
          { k: 'Duration', v: `${a.region.duration.toFixed(3)} s` },
          { k: 'Overlap score', v: a.region.overlap_score.toFixed(3), tag: <Provenance kind="heuristic" /> },
          { k: 'Pitch clash index', v: a.region.pitch_clash_index.toFixed(3), tag: <Provenance kind="heuristic" /> },
          { k: 'Energy variance', v: a.region.energy_variance.toFixed(4) },
          { k: 'Crest factor', v: fmtNum(f.crest_factor, 2) },
          { k: 'Baseline avg log-prob', v: fmtNum(f.baseline_avg_logprob, 3), tag: <Provenance kind="measured" /> },
          { k: 'Baseline confidence', v: fmtNum(f.baseline_confidence, 3), tag: <Provenance kind="measured" /> },
          { k: 'Baseline words in region', v: fmtNum(f.baseline_word_count, 0) },
        ]}
      />

      <h4 className="h-xs">Assumed or estimated</h4>
      <KV
        rows={[
          { k: 'Speaker count', v: String(a.region.speaker_count_estimate), tag: <Provenance kind="default" /> },
          { k: 'Est. separation latency', v: f.estimated_latency_sec == null ? '—' : `${f.estimated_latency_sec.toFixed(2)} s`, tag: <Provenance kind="estimate" /> },
        ]}
      />
      <p className="meta">The detector sets the speaker count to 2 for every region; it is not inferred from the audio.</p>

      <h4 className="h-xs">Prediction and decision</h4>
      <KV
        rows={[
          { k: 'Predicted benefit', v: fmtNum(a.decision?.predicted_benefit, 3), tag: <Provenance kind="heuristic" /> },
          { k: 'Utility', v: fmtNum(a.decision?.utility, 3), tag: <Provenance kind="heuristic" /> },
          { k: 'Decision', v: <DecisionBadge mode={a.decision?.decision} long /> },
        ]}
      />
      {a.decision && <p className="rationale">{a.decision.rationale}</p>}

      <h4 className="h-xs">Processing outcome</h4>
      <KV
        rows={[
          { k: 'Outcome', v: OUTCOME_LABEL[a.outcome] },
          { k: 'Measured separation time', v: a.separation ? fmtMs(a.separation.separation_duration_ms) : 'not run', tag: a.separation ? <Provenance kind="measured" /> : undefined },
          { k: 'Stream RMS ratio A/B', v: a.separation?.success ? `${a.separation.rms_ratio_db.toFixed(1)} dB` : '—' },
          { k: 'Segments: baseline / streams / final', v: `${a.baselineSegments.length} / ${a.streamSegments.length} / ${a.finalSegments.length}` },
        ]}
      />
    </div>
  );
}

function ReconciliationAudit({ result }: { result: PipelineResult }) {
  const au = reconciliationAudit(result);
  const regions = result.detected_overlaps.map((o) => analyzeRegion(result, o));
  const conflictCandidates = regions.filter((r) => r.decision?.decision === 'ROUTE_SEPARATION' && r.baselineSegments.length > 0 && r.streamSegments.length > 0).length;
  const rows: { k: string; v: string; note: string }[] = [
    { k: 'Regions routed to separation', v: String(au.routedRegions), note: 'Routing decisions' },
    { k: 'Candidate conflicts', v: String(conflictCandidates), note: 'Routed regions where both the mixture and a separated stream produced text' },
    { k: 'Separated segments adopted', v: String(au.backend.conflicts_resolved), note: 'Backend counter (“conflicts_resolved”): separated segments kept in the final transcript' },
    { k: 'Words added from separated streams', v: String(au.wordsFromStreams), note: 'Counted from final transcript text with stream provenance' },
    { k: 'Baseline words replaced', v: String(au.baselineWordsReplaced), note: 'Mixture words not present in the final transcript' },
    { k: 'Separated segments removed by the reconciler', v: `${au.separatedSegmentsDropped} (${au.separatedWordsDropped} words)`, note: 'In the separated output but not in the final transcript (repetition or duplicate cross-talk rules)' },
    { k: 'Words rejected by the repetition filter', v: String(au.backend.words_rejected), note: 'Backend counter; relies on word timestamps being enabled' },
    { k: 'Regions restored to mixture', v: String(au.fellBackRegions), note: 'Separation produced no usable text or failed' },
    { k: 'Unresolved (flagged for review)', v: String(au.flaggedRegions), note: 'The policy declined to decide' },
  ];
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr><th scope="col">Quantity</th><th scope="col" className="num">Value</th><th scope="col">Basis</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}><th scope="row">{r.k}</th><td className="mono num">{r.v}</td><td className="meta">{r.note}</td></tr>
          ))}
          <tr><th scope="row">Words: mixture → final</th><td className="mono num">{au.baselineWords} → {au.finalWords}</td><td className="meta">From transcript text</td></tr>
        </tbody>
      </table>
      <p className="meta">These come from the three transcripts of this run. Whether separation improved accuracy cannot be known without a reference transcript, so no recovery claim is made.</p>
    </div>
  );
}

export function Inspector() {
  const wb = useWorkbench();
  const { result, recording, playback } = wb;

  const analyses = useMemo(() => (result ? result.detected_overlaps.map((o) => analyzeRegion(result, o)) : []), [result]);
  const selected = analyses.find((a) => a.region.region_id === wb.selectedRegionId) ?? null;
  const segment = result?.final_transcript.find((s) => s.id === wb.selectedSegmentId) ?? result?.baseline_segments.find((s) => s.id === wb.selectedSegmentId) ?? result?.reconciliation.separated_segments.find((s) => s.id === wb.selectedSegmentId) ?? null;

  const lanes: Lane[] = useMemo(() => {
    if (!result) return [];
    const mk = (segs: PipelineResult['final_transcript'], idp: string) =>
      segs.map((s) => ({
        id: `${idp}${s.id}`,
        start: s.start,
        end: s.end,
        label: s.text,
        title: `${s.speaker} ${fmtSec(s.start)}–${fmtSec(s.end)}: ${s.text}`,
        selected: s.id === wb.selectedSegmentId,
        color: speakerColor(s.speaker),
        onClick: () => {
          wb.selectSegment(s.id);
          wb.playback.seek(s.start);
        },
      }));
    const out: Lane[] = [];
    [...new Set(result.final_transcript.map((s) => s.speaker))].sort().forEach((spk) =>
      out.push({ id: `final-${spk}`, label: `${spk} · final`, color: speakerColor(spk), items: mk(result.final_transcript.filter((s) => s.speaker === spk), 'f') }),
    );
    if (result.baseline_segments.length)
      out.push({ id: 'baseline', label: 'Mixture baseline', items: mk(result.baseline_segments, 'b').map((i) => ({ ...i, color: 'var(--ink-3)' })) });
    for (const [path, label] of [['separated_stream_a', 'Stream A'], ['separated_stream_b', 'Stream B']] as const) {
      const segs = result.reconciliation.separated_segments.filter((s) => s.source_path === path);
      if (segs.length) out.push({ id: path, label, color: speakerColor(path === 'separated_stream_a' ? 'Speaker 1' : 'Speaker 2'), items: mk(segs, path) });
    }
    return out;
  }, [result, wb]);

  if (!result || !recording) {
    return (
      <>
        <PageHeader eyebrow="02 — Inspect" title="Overlap Inspector">
          Examine overlapping regions, speaker attribution and how the final transcript was reconciled.
        </PageHeader>
        <EmptyState
          title="Nothing to inspect yet"
          action={
            <>
              <button type="button" className="btn btn-primary" onClick={() => wb.navigate('studio')}>Open ASR Studio</button>
              {wb.demos.find((d) => d.id === 'overlap_two_speakers') && (
                <button type="button" className="btn btn-line" onClick={() => { wb.navigate('studio'); void wb.loadDemo('overlap_two_speakers', { autoTranscribe: true }); }}>
                  Run the overlapping demo
                </button>
              )}
            </>
          }
        >
          The inspector works on a transcribed recording. Transcribe one in ASR Studio, or open a saved run from the Overview.
        </EmptyState>
      </>
    );
  }

  const routed = analyses.filter((a) => a.decision?.decision === 'ROUTE_SEPARATION').length;

  return (
    <>
      <PageHeader eyebrow="02 — Inspect" title="Overlap Inspector">
        {recording.name} · {fmtSec(result.audio_metadata.duration_seconds)} · {analyses.length} candidate region{analyses.length === 1 ? '' : 's'} · {routed} routed to separation
      </PageHeader>

      <Section
        title="Timeline"
        hint="Amber blocks are candidate overlaps from a heuristic detector. Click a block to inspect it without playing; click the waveform to move the playhead."
        actions={
          <div className="transport-controls">
            <button type="button" className="icon-btn" aria-label="Restart" onClick={playback.restart}><RotateCcw size={15} /></button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={playback.toggle}>
              {playback.playing ? <Pause size={14} /> : <Play size={14} />} {playback.playing ? 'Pause' : 'Play'}
            </button>
            <span className="mono transport-time">{fmtClock(playback.time)} <span className="dim">/ {fmtClock(playback.duration)}</span></span>
          </div>
        }
      >
        <Timeline
          peaks={recording.peaks}
          duration={recording.decoded?.duration ?? result.audio_metadata.duration_seconds}
          playback={playback}
          regions={result.detected_overlaps.map((o) => ({ id: o.region_id, start: o.start, end: o.end }))}
          selectedRegionId={wb.selectedRegionId}
          onSelectRegion={wb.selectRegion}
          highlight={segment ? { start: segment.start, end: segment.end } : null}
          lanes={lanes}
          gutter
          height={104}
          decodeError={recording.decodeError}
        />
        {analyses.length === 0 && (
          <p className="meta">The detector found no candidate overlap regions in this recording, so there are no regions to inspect. Speaker lanes still show the transcript.</p>
        )}
      </Section>

      {analyses.length > 0 && (
        <div className="inspector-grid">
          <Section title="Candidate regions" hint="Only fields the backend actually produces are shown.">
            <RegionTable rows={analyses} selectedId={wb.selectedRegionId} onSelect={wb.selectRegion} />
          </Section>
          <Section title={selected ? 'Region inspection' : 'Region inspection'} className="region-panel">
            {selected ? (
              <RegionDetail a={selected} />
            ) : (
              <EmptyState title="Select a region">Choose a row or an amber block on the timeline to see its evidence, decision and outcome.</EmptyState>
            )}
          </Section>
        </div>
      )}

      {selected && (
        <Section title="Region audio comparison" hint="Aligned mixture and separated streams for the selected region. Only streams that exist are listed.">
          <RegionCompare analysis={selected} recording={recording} playback={playback} />
        </Section>
      )}

      <Section title={<>Reconciliation audit <Chip tone="neutral">computed from this run</Chip></>} hint="How the final transcript relates to the mixture baseline and the separated streams.">
        <ReconciliationAudit result={result} />
      </Section>
    </>
  );
}
