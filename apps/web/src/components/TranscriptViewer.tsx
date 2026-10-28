import { useEffect, useMemo, useState } from 'react';
import { Download, Play } from 'lucide-react';
import { useWorkbench } from '../state/store';
import { availableViews } from '../lib/analysis';
import type { TranscriptView } from '../lib/analysis';
import { buildExport, downloadText, safeStem } from '../lib/export';
import type { ExportFormat } from '../lib/export';
import { sourceLabel, speakerColor } from '../lib/speakers';
import { fmtPct, fmtSec } from '../lib/format';
import { EmptyState, Segmented } from './ui';
import type { TranscriptSegment } from '../types';

const FORMATS: ExportFormat[] = ['txt', 'srt', 'vtt', 'json'];

export function TranscriptViewer() {
  const wb = useWorkbench();
  const { result, recording, playback } = wb;
  const views = useMemo(() => (result ? availableViews(result) : []), [result]);
  const [viewId, setViewId] = useState<TranscriptView>('final');
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const segments: TranscriptSegment[] = useMemo(() => view?.segments ?? [], [view]);

  // Up/down moves between transcript segments (keyboard shortcuts).
  const { setNavigator, selectSegment, selectedSegmentId } = wb;
  useEffect(() => {
    if (segments.length === 0) return;
    setNavigator((d) => {
      const i = segments.findIndex((s) => s.id === selectedSegmentId);
      const next = segments[Math.min(segments.length - 1, Math.max(0, (i < 0 ? (d > 0 ? -1 : segments.length) : i) + d))];
      selectSegment(next.id);
      playback.seek(next.start);
      document.getElementById(`seg-${next.id}`)?.scrollIntoView({ block: 'nearest' });
    });
    return () => setNavigator(null);
  }, [segments, selectedSegmentId, setNavigator, selectSegment, playback]);

  const exportAs = (fmt: ExportFormat) => {
    if (!result) return;
    const { content, mime } = buildExport(fmt, segments, result);
    const suffix = fmt === 'json' ? 'result' : view?.id ?? 'final';
    downloadText(`routone_${safeStem(recording?.name ?? 'recording')}_${suffix}.${fmt}`, content, mime);
  };

  return (
    <div className="transcript">
      <div className="transcript-head">
        {result && views.length > 0 ? (
          <Segmented
            label="Transcript view"
            value={view.id}
            onChange={setViewId}
            options={views.map((v) => ({ id: v.id, label: v.label, badge: v.segments.length }))}
          />
        ) : (
          <h2 className="h-sm">Transcript</h2>
        )}
        <div className="export-bar" role="group" aria-label="Export transcript">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={!result}
              onClick={() => exportAs(f)}
              title={
                !result
                  ? 'Unavailable: no results yet. Transcribe a recording first.'
                  : f === 'json'
                    ? 'Full pipeline result (embedded stream audio omitted)'
                    : `Export the “${view?.label}” view as ${f.toUpperCase()}`
              }
            >
              <Download size={13} aria-hidden="true" /> {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {!result && <p className="meta">Exports are unavailable until a recording has been transcribed.</p>}

      {!result ? (
        <EmptyState title={wb.operation.kind === 'transcribing' ? 'Transcribing…' : 'No transcript yet'}>
          {wb.operation.kind === 'transcribing'
            ? 'The pipeline is running: mixture ASR, overlap detection, routing, optional separation, reconciliation.'
            : 'Load a recording and press Transcribe. Results appear here with speaker, timestamps and confidence.'}
        </EmptyState>
      ) : segments.length === 0 ? (
        <EmptyState title="No speech was recognized">
          The recognizer returned no segments for this recording{result.config?.vad_filter ? '. Voice activity detection is on and may have removed quiet speech; try turning it off and transcribing again' : ''}.
        </EmptyState>
      ) : (
        <ol className="seg-list" aria-label={`${view.label} transcript segments`}>
          {segments.map((s) => {
            const active = playback.time >= s.start && playback.time < s.end;
            const selected = s.id === wb.selectedSegmentId;
            return (
              <li
                key={s.id}
                id={`seg-${s.id}`}
                className={`seg ${selected ? 'is-selected' : ''} ${active ? 'is-active' : ''}`}
                style={{ ['--spk' as string]: speakerColor(s.speaker) }}
              >
                <button
                  type="button"
                  className="seg-main"
                  aria-pressed={selected}
                  onClick={() => {
                    wb.selectSegment(selected ? null : s.id);
                    if (!selected) playback.seek(s.start);
                  }}
                >
                  <span className="seg-time mono">
                    {fmtSec(s.start)}
                    <i>–</i>
                    {fmtSec(s.end)}
                  </span>
                  <span className="seg-speaker">
                    <i className="swatch" style={{ background: speakerColor(s.speaker) }} />
                    {s.speaker}
                  </span>
                  <span className="seg-text">
                    {s.words.length > 0
                      ? s.words.map((w, i) => (
                          <span
                            key={i}
                            className={w.probability < 0.5 ? 'w is-low' : 'w'}
                            title={`${fmtSec(w.start)}–${fmtSec(w.end)} · word confidence ${fmtPct(w.probability, 0)}`}
                          >
                            {w.word}{' '}
                          </span>
                        ))
                      : s.text}
                  </span>
                </button>
                <span className="seg-meta mono">
                  <span title="Segment confidence = exp(avg log-probability)">{fmtPct(s.confidence, 0)}</span>
                  <span>{s.language.toUpperCase()}</span>
                  <span className="seg-path">{sourceLabel(s.source_path)}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Play segment ${fmtSec(s.start)} to ${fmtSec(s.end)}`}
                  title="Play this segment"
                  onClick={() => {
                    wb.selectSegment(s.id);
                    playback.playRange(s.start, s.end);
                  }}
                >
                  <Play size={14} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
