import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { base64ToBlob, computePeaks, decodeAudio, encodeWav } from '../lib/audio';
import type { RegionAnalysis } from '../lib/analysis';
import { speakerColor } from '../lib/speakers';
import { fmtPct, fmtSec } from '../lib/format';
import type { Recording } from '../state/store';
import type { Playback } from '../state/store';
import type { TranscriptSegment } from '../types';

interface Track {
  id: 'mix' | 'a' | 'b';
  label: string;
  url: string;
  peaks: Float32Array;
  duration: number;
  segments: TranscriptSegment[];
  color: string;
}

const COLS = 600;

function MiniWave({ peaks, frac, regionFrom, regionTo, color, onSeek }: { peaks: Float32Array; frac: number; regionFrom: number; regionTo: number; color: string; onSeek: (f: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = ref.current;
    const b = box.current;
    if (!c || !b) return;
    const draw = () => {
      const w = Math.floor(b.getBoundingClientRect().width);
      const h = 56;
      const dpr = window.devicePixelRatio || 1;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      let max = 0.0001;
      for (let i = 0; i < peaks.length; i++) max = Math.max(max, Math.abs(peaks[i]));
      ctx.fillStyle = color;
      const cols = peaks.length / 2;
      for (let x = 0; x < w; x++) {
        const i0 = Math.floor((x / w) * cols);
        const i1 = Math.max(i0 + 1, Math.floor(((x + 1) / w) * cols));
        let lo = 0;
        let hi = 0;
        for (let i = i0; i < i1 && i < cols; i++) {
          lo = Math.min(lo, peaks[i * 2]);
          hi = Math.max(hi, peaks[i * 2 + 1]);
        }
        const amp = (h / 2 - 2) / max;
        ctx.fillRect(x, h / 2 - hi * amp, 1, Math.max(1, (hi - lo) * amp));
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(b);
    return () => ro.disconnect();
  }, [peaks, color]);
  return (
    <div
      className="mini-wave"
      ref={box}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - r.left) / r.width);
      }}
    >
      <canvas ref={ref} />
      <div className="mini-region" style={{ left: `${regionFrom * 100}%`, width: `${(regionTo - regionFrom) * 100}%` }} />
      <div className="mini-head" style={{ left: `${frac * 100}%` }} />
    </div>
  );
}

/** Aligned comparison of the mixture and any separated streams for one region. Only existing streams are shown. */
export function RegionCompare({ analysis, recording, playback }: { analysis: RegionAnalysis; recording: Recording | null; playback: Playback }) {
  const { region, separation } = analysis;
  const decoded = recording?.decoded ?? null;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [active, setActive] = useState<Track['id'] | null>(null);
  const [t, setT] = useState(0);
  const audios = useRef<Map<string, HTMLAudioElement>>(new Map());
  const winRef = useRef({ start: 0, end: 0 });

  const win = useMemo(() => {
    const dur = decoded?.duration ?? region.end + 0.1;
    const s = separation?.window_start ?? Math.max(0, region.start - 0.1);
    const e = separation?.window_end ?? Math.min(dur, region.end + 0.1);
    return { start: s, end: Math.max(e, s + 0.05) };
  }, [region, separation, decoded]);
  winRef.current = win;

  const hasStreams = !!(separation?.success && separation.stream_a_audio_b64 && separation.stream_b_audio_b64);

  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    audios.current.forEach((a) => a.pause());
    audios.current.clear();
    setActive(null);
    setT(0);
    setTracks([]);
    setStatus(null);
    (async () => {
      const next: Track[] = [];
      if (decoded) {
        const i0 = Math.floor(win.start * decoded.sampleRate);
        const i1 = Math.min(decoded.samples.length, Math.ceil(win.end * decoded.sampleRate));
        const slice = decoded.samples.slice(i0, i1);
        const url = URL.createObjectURL(encodeWav(slice, decoded.sampleRate));
        urls.push(url);
        next.push({ id: 'mix', label: 'Original mixture', url, peaks: computePeaks(slice, decoded.sampleRate, COLS), duration: slice.length / decoded.sampleRate, segments: analysis.baselineSegments, color: '#8F897D' });
      }
      if (hasStreams && separation) {
        try {
          for (const [id, b64, src, label] of [
            ['a', separation.stream_a_audio_b64 as string, 'separated_stream_a', 'Separated stream A'],
            ['b', separation.stream_b_audio_b64 as string, 'separated_stream_b', 'Separated stream B'],
          ] as const) {
            const blob = base64ToBlob(b64);
            const dec = await decodeAudio(blob);
            const url = URL.createObjectURL(blob);
            urls.push(url);
            next.push({ id, label, url, peaks: computePeaks(dec.samples, dec.sampleRate, COLS), duration: dec.duration, segments: analysis.streamSegments.filter((s) => s.source_path === src), color: speakerColor(id === 'a' ? 'Speaker 1' : 'Speaker 2') });
          }
        } catch {
          if (live) setStatus('The separated streams could not be decoded for display.');
        }
      }
      if (!live) return;
      next.forEach((tr) => {
        const a = new Audio(tr.url);
        a.preload = 'auto';
        a.addEventListener('ended', () => {
          setActive(null);
          setT(0);
        });
        audios.current.set(tr.id, a);
      });
      setTracks(next);
    })();
    const map = audios.current;
    return () => {
      live = false;
      map.forEach((a) => a.pause());
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [analysis, decoded, hasStreams, separation, win]);

  // Shared playhead from whichever track is playing.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const a = audios.current.get(active);
      if (a) setT(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const winLen = Math.max(0.05, win.end - win.start);
  const seekAll = useCallback((tt: number) => {
    audios.current.forEach((a) => {
      try {
        a.currentTime = Math.min(tt, a.duration || tt);
      } catch {
        /* not ready */
      }
    });
    setT(tt);
  }, []);

  const play = (id: Track['id']) => {
    playback.audio.pause();
    audios.current.forEach((a, k) => k !== id && a.pause());
    const a = audios.current.get(id);
    if (!a) return;
    if (active === id) {
      a.pause();
      setActive(null);
      return;
    }
    a.currentTime = Math.min(t, a.duration || t);
    void a.play();
    setActive(id);
  };

  const rf = (region.start - win.start) / winLen;
  const rt = (region.end - win.start) / winLen;

  return (
    <div className="compare">
      <p className="meta">
        Window {fmtSec(win.start)}–{fmtSec(win.end)} (region ± padding). Playheads and the amber region are synchronized across tracks.
      </p>
      {tracks.map((tr) => (
        <div className="compare-track" key={tr.id}>
          <div className="compare-head">
            <button type="button" className="icon-btn" aria-label={`${active === tr.id ? 'Pause' : 'Play'} ${tr.label}`} onClick={() => play(tr.id)}>
              {active === tr.id ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <strong>{tr.label}</strong>
            <span className="meta mono">{fmtSec(Math.min(t, tr.duration))} / {fmtSec(tr.duration)}</span>
          </div>
          <MiniWave peaks={tr.peaks} frac={Math.min(1, t / winLen)} regionFrom={Math.max(0, rf)} regionTo={Math.min(1, rt)} color={tr.color} onSeek={(f) => seekAll(f * winLen)} />
          <div className="compare-text">
            {tr.segments.length === 0 ? (
              <span className="meta">No recognized text in this region for this stream.</span>
            ) : (
              tr.segments.map((s) => (
                <p key={s.id}>
                  <span className="mono dim">{fmtSec(s.start)}–{fmtSec(s.end)} · {fmtPct(s.confidence, 0)}</span> {s.text}
                </p>
              ))
            )}
          </div>
        </div>
      ))}
      {!hasStreams && (
        <p className="meta">
          {separation && !separation.success
            ? `Separation was attempted but did not succeed (${separation.details}). No separated streams exist.`
            : `Separation did not run for this region (decision: ${analysis.decision?.decision ?? 'unknown'}), so there are no separated streams to compare. Only the mixture is shown.`}
        </p>
      )}
      {status && <p className="text-red">{status}</p>}
      {!decoded && <p className="meta">The original audio could not be decoded, so the mixture track is unavailable.</p>}
    </div>
  );
}
