import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Mic, Pause, Play, RotateCcw, Square, Upload, Wand2 } from 'lucide-react';
import { useWorkbench } from '../state/store';
import { Timeline } from './Timeline';
import { Chip, Spinner } from './ui';
import { fmtBytes, fmtClock, fmtSec } from '../lib/format';

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt == null ? 0 : (now - startedAt) / 1000;
}

function DemoMenu() {
  const wb = useWorkbench();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const busy = wb.operation.kind !== 'idle' || wb.mic.recording;
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn btn-line" aria-haspopup="listbox" aria-expanded={open} disabled={busy || wb.demos.length === 0} onClick={() => setOpen((o) => !o)}>
        <Wand2 size={15} aria-hidden="true" /> Demo recording <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <ul className="menu" role="listbox" aria-label="Demo recordings">
          {wb.demos.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  setOpen(false);
                  void wb.loadDemo(d.id);
                }}
              >
                <strong>{d.label}</strong>
                <span>{d.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RecordingPanel({ variant = 'studio' }: { variant?: 'studio' | 'overview' }) {
  const wb = useWorkbench();
  const { recording, result, playback, mic, operation, backend } = wb;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const transcribing = operation.kind === 'transcribing';
  const loading = operation.kind === 'loading';
  const elapsed = useElapsed(transcribing ? operation.startedAt : null);
  const duration = recording?.decoded?.duration ?? playback.duration;
  const segment = result?.final_transcript.find((s) => s.id === wb.selectedSegmentId) ?? result?.baseline_segments.find((s) => s.id === wb.selectedSegmentId) ?? result?.reconciliation.separated_segments.find((s) => s.id === wb.selectedSegmentId) ?? null;

  const state = mic.recording
    ? 'Recording from microphone'
    : loading
      ? operation.label
      : transcribing
        ? `Transcribing · ${elapsed.toFixed(0)} s elapsed`
        : result
          ? 'Transcribed'
          : recording
            ? 'Ready to transcribe'
            : 'No recording loaded';

  return (
    <div
      className={`recording ${dragOver ? 'is-dragover' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void wb.loadFile(f);
      }}
    >
      <div className="recording-sources" role="group" aria-label="Choose audio source">
        <DemoMenu />
        <button type="button" className="btn btn-line" disabled={transcribing || loading || mic.recording} onClick={() => fileRef.current?.click()}>
          <Upload size={15} aria-hidden="true" /> Upload audio
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg,.webm"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void wb.loadFile(f);
            e.target.value = '';
          }}
        />
        {mic.recording ? (
          <button type="button" className="btn btn-recording" onClick={wb.stopMic}>
            <Square size={14} aria-hidden="true" /> Stop recording
            <span className="rec-time mono" aria-live="off">{fmtClock(mic.elapsed, 1)}</span>
            <span className="rec-meter" aria-hidden="true"><i style={{ width: `${Math.round(mic.level * 100)}%` }} /></span>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-line"
            disabled={!mic.supported || transcribing || loading}
            title={mic.supported ? 'Record from the microphone' : 'This browser does not support microphone recording (MediaRecorder / getUserMedia).'}
            onClick={() => void wb.startMic()}
          >
            <Mic size={15} aria-hidden="true" /> Record
          </button>
        )}
      </div>

      <div className="recording-file">
        {recording ? (
          <>
            <span className="file-name" title={recording.name}>{recording.name}</span>
            <Chip tone="neutral">{recording.source === 'history' ? 'saved run' : recording.source}</Chip>
            <span className="meta mono">{fmtSec(duration)}</span>
            <span className="meta mono">{recording.sourceSampleRate ? `${recording.sourceSampleRate} Hz` : 'rate n/a'}</span>
            <span className="meta mono">{recording.decoded ? `${recording.decoded.channels} ch` : ''}</span>
            <span className="meta mono">{fmtBytes(recording.sizeBytes)}</span>
          </>
        ) : (
          <span className="meta">Drop an audio file here, or choose a demo, upload, or record.</span>
        )}
      </div>

      <Timeline
        peaks={recording?.peaks ?? null}
        duration={duration}
        playback={playback}
        regions={result?.detected_overlaps.map((o) => ({
          id: o.region_id,
          start: o.start,
          end: o.end,
          title: `${o.region_id}: ${fmtSec(o.start)}–${fmtSec(o.end)}, overlap score ${o.overlap_score.toFixed(3)} (heuristic). Click to inspect without playing.`,
        }))}
        selectedRegionId={wb.selectedRegionId}
        onSelectRegion={wb.selectRegion}
        highlight={segment ? { start: segment.start, end: segment.end } : null}
        height={variant === 'overview' ? 96 : 128}
        decodeError={recording?.decodeError}
        placeholder={loading ? <Spinner label={state} /> : 'No audio yet. The waveform is computed from the actual recording you load.'}
        legend={variant === 'studio'}
      />

      <div className="transport">
        <div className="transport-controls">
          <button type="button" className="icon-btn" aria-label="Restart from beginning" disabled={!recording} onClick={playback.restart}>
            <RotateCcw size={16} />
          </button>
          <button type="button" className="btn btn-quiet btn-play" aria-label={playback.playing ? 'Pause' : 'Play'} disabled={!recording} onClick={playback.toggle}>
            {playback.playing ? <Pause size={16} /> : <Play size={16} />}
            {playback.playing ? 'Pause' : 'Play'}
          </button>
          <span className="transport-time mono">
            {fmtClock(playback.time)} <span className="dim">/ {fmtClock(duration)}</span>
          </span>
        </div>
        <div className="transport-state" role="status">
          {transcribing ? <Spinner label={state} /> : <span className={`state-dot ${result ? 'ok' : recording ? 'ready' : ''}`}>{state}</span>}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!recording || transcribing || loading || mic.recording || backend !== 'online'}
          title={backend !== 'online' ? 'The backend is not reachable.' : undefined}
          onClick={() => void wb.transcribe()}
        >
          {transcribing ? 'Transcribing…' : result ? 'Transcribe again' : 'Transcribe'}
        </button>
      </div>
    </div>
  );
}
