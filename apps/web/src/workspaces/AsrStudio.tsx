import { useState } from 'react';
import { PanelRight, PanelRightClose, FileText, FileJson } from 'lucide-react';
import { useWorkbench, effectiveStrategy } from '../state/store';
import type { Settings } from '../state/store';
import { RecordingPanel } from '../components/RecordingPanel';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { TraceList } from '../components/TraceList';
import { Chip, InfoHint, KV, PageHeader, Provenance, Section, Toggle } from '../components/ui';
import { downloadText, resultForJson, safeStem } from '../lib/export';
import { buildRunReport } from '../lib/report';
import { fmtMs, fmtNum, fmtPct, fmtSec, titleCase } from '../lib/format';
import type { PipelineResult, RoutingStrategy } from '../types';

type Key = 'language' | 'asrModel' | 'vadFilter' | 'wordTimestamps' | 'strategy' | 'lambdaParam' | 'threshold';

/** Whether a setting is only configured, active in the last run, or changed since. */
function applyState(key: Key, s: Settings, r: PipelineResult | null): { tone: 'neutral' | 'green' | 'amber'; label: string } {
  if (!r?.config) return { tone: 'neutral', label: 'Configured' };
  const c = r.config;
  const same = (() => {
    switch (key) {
      case 'language': return (c.language ?? 'auto') === s.language;
      case 'asrModel': return c.asr_model === s.asrModel;
      case 'vadFilter': return c.vad_filter === s.vadFilter;
      case 'wordTimestamps': return c.word_timestamps === s.wordTimestamps;
      case 'strategy': return c.routing_strategy === effectiveStrategy(s);
      case 'lambdaParam': return c.lambda_param == null || Math.abs(c.lambda_param - s.lambdaParam) < 1e-9;
      case 'threshold': return c.threshold == null || Math.abs(c.threshold - s.threshold) < 1e-9;
    }
  })();
  return same ? { tone: 'green', label: 'Active in last run' } : { tone: 'amber', label: 'Changed · next run' };
}

function Row({ k, label, hint, children }: { k: Key; label: string; hint: string; children: React.ReactNode }) {
  const wb = useWorkbench();
  const st = applyState(k, wb.settings, wb.result);
  return (
    <div className="field">
      <div className="field-head">
        <label>
          {label}
          <InfoHint text={hint} />
        </label>
        <Chip tone={st.tone}>{st.label}</Chip>
      </div>
      {children}
    </div>
  );
}

const STRATEGY_COPY: Record<Exclude<RoutingStrategy, 'never_separate'>, string> = {
  benefit_aware: 'Separate when predicted benefit minus λ·cost clears a margin (heuristic utility).',
  threshold: 'Separate whenever the detector’s overlap score reaches θ.',
  always_separate: 'Separate every candidate region.',
};

function ConfigPanel() {
  const wb = useWorkbench();
  const { settings: s, setSettings, health } = wb;
  const available = health?.runtime?.asr.available_models;

  return (
    <div className="config">
      <Section title="Speech recognition">
        <Row k="language" label="Language" hint="Forces the Whisper language, or lets Whisper detect it from the first 30 seconds.">
          <select className="input" value={s.language} onChange={(e) => setSettings({ language: e.target.value as Settings['language'] })}>
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="ta">Tamil</option>
          </select>
        </Row>
        <Row k="asrModel" label="ASR model" hint="faster-whisper checkpoint. Larger models are slower. Only checkpoints already on disk can be used.">
          <select className="input" value={s.asrModel} onChange={(e) => setSettings({ asrModel: e.target.value as Settings['asrModel'] })}>
            {(['tiny', 'base'] as const).map((m) => {
              const missing = available != null && !available.includes(m);
              return (
                <option key={m} value={m} disabled={missing}>
                  faster-whisper {m}{missing ? ' (not downloaded)' : ''}
                </option>
              );
            })}
          </select>
        </Row>
      </Section>

      <Section title="Routing">
        <div className="field field-inline">
          <div className="field-copy">
            <label>
              Adaptive separation
              <InfoHint text="When off, the mixture transcript is always used and separation never runs (strategy: never separate)." />
            </label>
            <small>{s.adaptive ? 'Separation may run on overlap regions.' : 'Mixture ASR only.'}</small>
          </div>
          <Toggle checked={s.adaptive} onChange={(v) => setSettings({ adaptive: v })} label="Adaptive separation" />
        </div>
        {s.adaptive && (
          <>
            <Row k="strategy" label="Routing policy" hint="How regions are chosen for separation. Benefit-aware is the project’s proposed policy; the others are baselines.">
              <select className="input" value={s.strategy} onChange={(e) => setSettings({ strategy: e.target.value as Settings['strategy'] })}>
                {Object.keys(STRATEGY_COPY).map((k) => (
                  <option key={k} value={k}>{titleCase(k)}</option>
                ))}
              </select>
              <small>{STRATEGY_COPY[s.strategy]}</small>
            </Row>
            {s.strategy === 'benefit_aware' && (
              <Row k="lambdaParam" label={`Latency penalty λ = ${s.lambdaParam.toFixed(2)}`} hint="utility = predicted_benefit − λ · normalized_cost. Higher λ makes separation harder to justify.">
                <input type="range" className="range" min={0} max={1.5} step={0.05} value={s.lambdaParam} onChange={(e) => setSettings({ lambdaParam: parseFloat(e.target.value) })} />
              </Row>
            )}
            {s.strategy === 'threshold' && (
              <Row k="threshold" label={`Overlap threshold θ = ${s.threshold.toFixed(2)}`} hint="Regions whose detector overlap score is at least θ are separated.">
                <input type="range" className="range" min={0.1} max={0.9} step={0.05} value={s.threshold} onChange={(e) => setSettings({ threshold: parseFloat(e.target.value) })} />
              </Row>
            )}
          </>
        )}
      </Section>

      <Section title="Post-processing">
        <div className="field field-inline">
          <div className="field-copy">
            <label>
              Voice activity detection
              <InfoHint text="Silero VAD removes non-speech before decoding. Turn off if quiet speech is being dropped." />
            </label>
            <small><Chip tone={applyState('vadFilter', s, wb.result).tone}>{applyState('vadFilter', s, wb.result).label}</Chip></small>
          </div>
          <Toggle checked={s.vadFilter} onChange={(v) => setSettings({ vadFilter: v })} label="Voice activity detection" />
        </div>
        <div className="field field-inline">
          <div className="field-copy">
            <label>
              Word timestamps
              <InfoHint text="Adds per-word times and confidences. Without them, segments carry text only and word-level counts in the reconciliation audit read zero." />
            </label>
            <small><Chip tone={applyState('wordTimestamps', s, wb.result).tone}>{applyState('wordTimestamps', s, wb.result).label}</Chip></small>
          </div>
          <Toggle checked={s.wordTimestamps} onChange={(v) => setSettings({ wordTimestamps: v })} label="Word timestamps" />
        </div>
      </Section>
    </div>
  );
}

function SidePanels() {
  const wb = useWorkbench();
  const { result, recording } = wb;
  const m = result?.audio_metadata;
  const dec = recording?.decoded;

  return (
    <>
      <Section title="Recording">
        {recording ? (
          <KV
            rows={[
              { k: 'Duration', v: fmtSec(dec?.duration ?? m?.duration_seconds), tag: <Provenance kind="measured" /> },
              { k: 'Source rate', v: recording.sourceSampleRate ? `${recording.sourceSampleRate} Hz` : 'unknown (non-WAV)' },
              { k: 'Analysis rate', v: m ? `${m.sample_rate} Hz mono` : 'after transcription' },
              { k: 'Channels (decoded)', v: dec ? String(dec.channels) : '—' },
              { k: 'SNR', v: m ? `${m.estimated_snr_db} dB` : '—', tag: m ? <Provenance kind="estimate" /> : undefined },
              { k: 'Detected language', v: result ? result.metrics.detected_language.toUpperCase() : '—' },
            ]}
          />
        ) : (
          <p className="meta">Load a recording to see its metadata.</p>
        )}
      </Section>

      <Section title="Routing summary">
        {result ? (
          <>
            <KV
              rows={[
                { k: 'Policy', v: `${titleCase(result.config?.routing_strategy ?? result.config?.controller ?? 'unknown')}` },
                { k: 'Candidate regions', v: String(result.detected_overlaps.length), tag: <Provenance kind="heuristic" /> },
                { k: 'Separated', v: `${result.metrics.separated_regions_count}${result.detected_overlaps.length ? ` (${fmtPct(result.metrics.separation_invocation_rate, 0)})` : ''}` },
                { k: 'Baseline ASR', v: fmtMs(result.metrics.baseline_transcribe_time_ms), tag: <Provenance kind="measured" /> },
                { k: 'Separation total', v: result.metrics.separation_time_ms == null ? '—' : fmtMs(result.metrics.separation_time_ms), tag: <Provenance kind="measured" /> },
                { k: 'Pipeline total', v: fmtMs(result.processing_time_ms), tag: <Provenance kind="measured" /> },
                { k: 'Real-time factor', v: fmtNum(result.metrics.real_time_factor, 3) },
              ]}
            />
            <div className="side-actions">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => wb.navigate('inspector')}>Overlap Inspector</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => wb.navigate('routing')}>Routing Lab</button>
            </div>
            <div className="side-actions">
              <button
                type="button"
                className="btn btn-line btn-sm"
                onClick={() => downloadText(`routone_${safeStem(recording?.name ?? 'run')}_report.md`, buildRunReport(result, recording?.name ?? 'recording', { sampleRateHz: recording?.sourceSampleRate }), 'text/markdown')}
              >
                <FileText size={13} aria-hidden="true" /> Report (.md)
              </button>
              <button
                type="button"
                className="btn btn-line btn-sm"
                onClick={() => downloadText(`routone_${safeStem(recording?.name ?? 'run')}_run.json`, JSON.stringify({ filename: recording?.name, result: resultForJson(result) }, null, 2), 'application/json')}
              >
                <FileJson size={13} aria-hidden="true" /> Run (.json)
              </button>
            </div>
          </>
        ) : (
          <p className="meta">Routing results appear after a transcription. Nothing is estimated before then.</p>
        )}
      </Section>
    </>
  );
}

export function AsrStudio() {
  const wb = useWorkbench();
  const [panel, setPanel] = useState(true);
  const { result } = wb;

  return (
    <>
      <PageHeader
        eyebrow="01 — Recognize"
        title="ASR Studio"
        actions={
          <button type="button" className="btn btn-quiet" aria-expanded={panel} onClick={() => setPanel((p) => !p)}>
            {panel ? <PanelRightClose size={15} aria-hidden="true" /> : <PanelRight size={15} aria-hidden="true" />}
            {panel ? 'Hide settings' : 'Show settings'}
          </button>
        }
      >
        Transcribe a recording, inspect word-level output, and see where the pipeline chose to separate overlapping speech.
      </PageHeader>

      <div className={`studio-grid ${panel ? '' : 'is-wide'}`}>
        <div className="studio-main">
          <RecordingPanel variant="studio" />
          <TranscriptViewer />
          {result && (
            <details className="disclosure">
              <summary>Processing trace <small>{result.trace?.length ?? 0} recorded events</small></summary>
              <div className="disclosure-body">
                <TraceList trace={result.trace} />
              </div>
            </details>
          )}
        </div>
        {panel && (
          <aside className="studio-side" aria-label="Processing configuration and metadata">
            <ConfigPanel />
            <SidePanels />
          </aside>
        )}
      </div>
    </>
  );
}
