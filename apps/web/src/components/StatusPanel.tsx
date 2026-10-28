import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useWorkbench } from '../state/store';
import { effectiveStrategy } from '../state/store';
import { titleCase } from '../lib/format';

export function StatusPanel() {
  const wb = useWorkbench();
  const [open, setOpen] = useState(false);
  const rt = wb.health?.runtime;
  const op = wb.operation;
  const opLabel =
    wb.mic.recording ? 'Recording microphone' : op.kind === 'idle' ? 'Idle' : op.kind === 'loading' ? op.label : op.kind === 'transcribing' ? 'Transcribing' : 'Running benchmark';

  const dot = wb.backend === 'online' ? 'ok' : wb.backend === 'offline' ? 'bad' : 'wait';
  const s = wb.settings;

  return (
    <div className="status">
      <button type="button" className="status-summary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`dot dot-${dot}`} aria-hidden="true" />
        <span className="status-main">
          <strong>{wb.backend === 'online' ? 'Backend online' : wb.backend === 'offline' ? 'Backend offline' : 'Connecting…'}</strong>
          <span>{op.kind === 'idle' && !wb.mic.recording ? (rt ? `${rt.asr.model_size} · ${rt.asr.device}` : 'No health data') : opLabel}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className={open ? 'rot' : ''} />
      </button>

      {open && (
        <div className="status-detail">
          <div className="status-group">
            <h4>Verified runtime <small>from /api/health</small></h4>
            {rt ? (
              <dl>
                <div><dt>ASR</dt><dd>{rt.asr.engine} {rt.asr.model_size} · {rt.asr.device} · {rt.asr.compute_type}</dd></div>
                <div><dt>ASR weights</dt><dd>{rt.asr.loaded ? 'loaded in memory' : 'not loaded (loads on first use)'}</dd></div>
                <div><dt>Separation</dt><dd>ConvTasNet · {rt.separation.device}</dd></div>
                <div><dt>Sep. weights</dt><dd>{rt.separation.loaded ? 'loaded in memory' : rt.separation.weights_cached ? 'cached on disk, not loaded' : 'not downloaded'}</dd></div>
                <div><dt>Accelerator</dt><dd>MPS {rt.accelerator.mps_available ? 'available' : 'unavailable'}, {rt.accelerator.mps_used ? 'in use' : 'not used'}</dd></div>
                <div><dt>Version</dt><dd>{wb.health?.version} · torch {wb.health?.torch_version}</dd></div>
              </dl>
            ) : (
              <p className="meta">{wb.backend === 'offline' ? 'The backend cannot be reached, so nothing is verified. Start it with `make server`.' : 'Waiting for the backend…'}</p>
            )}
          </div>
          <div className="status-group">
            <h4>Preferences <small>applied on the next run</small></h4>
            <dl>
              <div><dt>Language</dt><dd>{s.language === 'auto' ? 'auto-detect' : s.language}</dd></div>
              <div><dt>ASR model</dt><dd>{s.asrModel}{rt && rt.asr.model_size !== s.asrModel ? ` (loaded: ${rt.asr.model_size})` : ''}</dd></div>
              <div><dt>Routing</dt><dd>{titleCase(effectiveStrategy(s))}</dd></div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
