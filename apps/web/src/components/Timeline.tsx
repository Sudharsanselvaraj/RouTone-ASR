import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent, ReactNode } from 'react';
import type { Playback } from '../state/store';
import { fmtClock, fmtSec } from '../lib/format';

export interface LaneItem {
  id: string;
  start: number;
  end: number;
  label?: string;
  title?: string;
  color?: string;
  selected?: boolean;
  onClick?: () => void;
}

export interface Lane {
  id: string;
  label: string;
  color?: string;
  items: LaneItem[];
}

export interface TimelineRegion {
  id: string;
  start: number;
  end: number;
  title?: string;
}

interface Props {
  peaks: Float32Array | null;
  duration: number;
  playback: Playback;
  regions?: TimelineRegion[];
  selectedRegionId?: string | null;
  onSelectRegion?: (id: string | null) => void;
  /** A time range to outline (e.g. the selected transcript segment). */
  highlight?: { start: number; end: number } | null;
  lanes?: Lane[];
  height?: number;
  gutter?: boolean;
  decodeError?: string | null;
  legend?: boolean;
  /** Shown instead of a waveform when there is no audio. */
  placeholder?: ReactNode;
  ariaLabel?: string;
}

const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function drawPeaks(canvas: HTMLCanvasElement, peaks: Float32Array, width: number, height: number, color: string) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const cols = peaks.length / 2;
  // Global scale: normalise to the loudest peak so quiet recordings stay readable.
  let maxAbs = 0.0001;
  for (let i = 0; i < peaks.length; i++) maxAbs = Math.max(maxAbs, Math.abs(peaks[i]));
  const mid = height / 2;
  const amp = (height / 2 - 2) / maxAbs;
  ctx.fillStyle = color;
  for (let x = 0; x < width; x++) {
    const c0 = Math.floor((x / width) * cols);
    const c1 = Math.max(c0 + 1, Math.floor(((x + 1) / width) * cols));
    let lo = 0;
    let hi = 0;
    for (let c = c0; c < c1 && c < cols; c++) {
      lo = Math.min(lo, peaks[c * 2]);
      hi = Math.max(hi, peaks[c * 2 + 1]);
    }
    const y0 = mid - hi * amp;
    const y1 = mid - lo * amp;
    ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function Timeline({
  peaks,
  duration,
  playback,
  regions = [],
  selectedRegionId = null,
  onSelectRegion,
  highlight = null,
  lanes = [],
  height = 120,
  gutter = false,
  decodeError,
  legend = true,
  placeholder,
  ariaLabel = 'Audio timeline',
}: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const playedRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.getBoundingClientRect().width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [peaks]);

  useEffect(() => {
    if (!peaks || width <= 0 || !baseRef.current || !playedRef.current) return;
    drawPeaks(baseRef.current, peaks, width, height, cssVar('--wave-base', '#B7B0A2'));
    drawPeaks(playedRef.current, peaks, width, height, cssVar('--wave-played', '#24231F'));
  }, [peaks, width, height]);

  const frac = duration > 0 ? Math.min(1, Math.max(0, playback.time / duration)) : 0;

  const seekFromPointer = useCallback(
    (e: RPointerEvent<HTMLElement>) => {
      const el = plotRef.current;
      if (!el || duration <= 0) return;
      const r = el.getBoundingClientRect();
      playback.seek(((e.clientX - r.left) / r.width) * duration);
    },
    [duration, playback],
  );

  const ticks = useMemo(() => {
    if (duration <= 0 || width <= 0) return [] as number[];
    const target = duration / Math.max(1, width / 96);
    const step = TICK_STEPS.find((s) => s >= target) ?? 600;
    const out: number[] = [];
    for (let t = 0; t <= duration + 1e-6; t += step) out.push(Number(t.toFixed(3)));
    return out;
  }, [duration, width]);
  const tickDigits = ticks.length > 1 && ticks[1] - ticks[0] < 1 ? 1 : 0;

  const pos = (t: number) => `${(Math.min(Math.max(t, 0), duration) / duration) * 100}%`;
  const span = (a: number, b: number) => `${(Math.max(b - a, 0) / duration) * 100}%`;
  const selected = regions.find((r) => r.id === selectedRegionId) ?? null;
  const hasAudio = duration > 0;

  const speakerKeys = lanes.filter((l) => l.color).map((l) => ({ label: l.label, color: l.color as string }));

  return (
    <div className={`tl ${gutter ? 'tl-gutter' : ''}`} aria-label={ariaLabel}>
      <div className="tl-body">
        {/* Ruler */}
        <div className="tl-row tl-ruler-row">
          {gutter && <div className="tl-label" />}
          <div className="tl-plot tl-ruler" ref={gutter ? undefined : plotRef} onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); seekFromPointer(e); }} onPointerMove={(e) => dragging.current && seekFromPointer(e)} onPointerUp={() => (dragging.current = false)}>
            {hasAudio &&
              ticks.map((t) => (
                <span key={t} className="tl-tick" style={{ left: pos(t) }}>
                  <i />
                  <b className="mono">{fmtClock(t, tickDigits)}</b>
                </span>
              ))}
          </div>
        </div>

        {/* Waveform */}
        <div className="tl-row tl-wave-row">
          {gutter && <div className="tl-label">Mixture</div>}
          <div
            className="tl-plot tl-wave"
            style={{ height }}
            ref={gutter ? plotRef : undefined}
            role="slider"
            tabIndex={hasAudio ? 0 : -1}
            aria-label="Playback position"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration * 100) / 100}
            aria-valuenow={Math.round(playback.time * 100) / 100}
            aria-valuetext={`${fmtSec(playback.time)} of ${fmtSec(duration)}`}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('[data-region]')) return;
              dragging.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              seekFromPointer(e);
            }}
            onPointerMove={(e) => dragging.current && seekFromPointer(e)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            {peaks && hasAudio ? (
              <>
                <canvas ref={baseRef} className="tl-canvas" />
                <div className="tl-played" style={{ width: `${frac * 100}%` }}>
                  <canvas ref={playedRef} className="tl-canvas" />
                </div>
                <div className="tl-midline" />
              </>
            ) : (
              <div className="tl-placeholder">{decodeError ? `Waveform unavailable: ${decodeError}` : placeholder ?? 'Load a recording to see its waveform.'}</div>
            )}

            {hasAudio &&
              regions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  data-region
                  className={`tl-region ${r.id === selectedRegionId ? 'is-selected' : ''}`}
                  style={{ left: pos(r.start), width: span(r.start, r.end) }}
                  title={r.title ?? `${r.id}: ${fmtSec(r.start)}–${fmtSec(r.end)} (select to inspect)`}
                  aria-label={`Overlap region ${r.id}, ${fmtSec(r.start)} to ${fmtSec(r.end)}`}
                  aria-pressed={r.id === selectedRegionId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRegion?.(r.id === selectedRegionId ? null : r.id);
                  }}
                />
              ))}

            {hasAudio && highlight && (
              <div className="tl-highlight" style={{ left: pos(highlight.start), width: span(highlight.start, highlight.end) }} />
            )}

            {hasAudio && selected && (
              <>
                <span className="tl-bound mono" style={{ left: pos(selected.start) }}>{selected.start.toFixed(2)}s</span>
                <span className="tl-bound tl-bound-end mono" style={{ left: pos(selected.end) }}>{selected.end.toFixed(2)}s</span>
              </>
            )}
          </div>
        </div>

        {/* Overlap lane + data lanes */}
        {gutter && hasAudio && regions.length > 0 && (
          <div className="tl-row">
            <div className="tl-label">Overlap</div>
            <div className="tl-plot tl-lane">
              {regions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`tl-item tl-item-overlap ${r.id === selectedRegionId ? 'is-selected' : ''}`}
                  style={{ left: pos(r.start), width: span(r.start, r.end) }}
                  title={r.title ?? `${r.id}: ${fmtSec(r.start)}–${fmtSec(r.end)}`}
                  aria-pressed={r.id === selectedRegionId}
                  onClick={() => onSelectRegion?.(r.id === selectedRegionId ? null : r.id)}
                >
                  <span>{r.id}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {gutter &&
          hasAudio &&
          lanes.map((lane) => (
            <div className="tl-row" key={lane.id}>
              <div className="tl-label" title={lane.label}>
                {lane.color && <i className="swatch" style={{ background: lane.color }} />}
                {lane.label}
              </div>
              <div className="tl-plot tl-lane">
                {lane.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className={`tl-item ${it.selected ? 'is-selected' : ''}`}
                    style={{
                      left: pos(it.start),
                      width: span(it.start, it.end),
                      ['--lane-color' as string]: it.color ?? lane.color ?? 'var(--ink-3)',
                    }}
                    title={it.title}
                    onClick={it.onClick}
                  >
                    <span>{it.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

        {/* Playhead spans all rows */}
        {hasAudio && (
          <div className="tl-playhead-layer" aria-hidden="true">
            <div className={`tl-playhead ${playback.playing ? 'is-playing' : ''}`} style={{ left: `${frac * 100}%` }}>
              <span className="tl-playhead-time mono">{fmtSec(playback.time)}</span>
            </div>
          </div>
        )}
      </div>

      {legend && hasAudio && (
        <div className="tl-legend">
          <span><i className="lg lg-wave" /> Waveform (played / unplayed)</span>
          <span><i className="lg lg-overlap" /> Candidate overlap (heuristic detector)</span>
          <span><i className="lg lg-selected" /> Selected region</span>
          <span><i className="lg lg-segment" /> Selected transcript segment</span>
          {speakerKeys.map((s) => (
            <span key={s.label}><i className="lg" style={{ background: s.color }} /> {s.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
