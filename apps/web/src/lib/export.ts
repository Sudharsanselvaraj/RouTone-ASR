import type { PipelineResult, TranscriptSegment } from '../types';

export type ExportFormat = 'txt' | 'srt' | 'vtt' | 'json';

function split(sec: number): { h: number; m: number; s: number; ms: number } {
  const total = Math.max(0, Math.round(sec * 1000));
  return { h: Math.floor(total / 3_600_000), m: Math.floor((total % 3_600_000) / 60_000), s: Math.floor((total % 60_000) / 1000), ms: total % 1000 };
}
const p2 = (n: number) => String(n).padStart(2, '0');
const p3 = (n: number) => String(n).padStart(3, '0');

export function srtTime(sec: number): string {
  const { h, m, s, ms } = split(sec);
  return `${p2(h)}:${p2(m)}:${p2(s)},${p3(ms)}`;
}

export function vttTime(sec: number): string {
  const { h, m, s, ms } = split(sec);
  return `${p2(h)}:${p2(m)}:${p2(s)}.${p3(ms)}`;
}

export function toTxt(segs: TranscriptSegment[]): string {
  return segs.map((s) => `[${s.start.toFixed(2)} - ${s.end.toFixed(2)}] ${s.speaker}: ${s.text}`).join('\n') + '\n';
}

export function toSrt(segs: TranscriptSegment[]): string {
  return (
    segs.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n[${s.speaker}] ${s.text}\n`).join('\n')
  );
}

export function toVtt(segs: TranscriptSegment[]): string {
  return (
    'WEBVTT\n\n' +
    segs.map((s, i) => `${i + 1}\n${vttTime(s.start)} --> ${vttTime(s.end)}\n<v ${s.speaker}>${s.text}\n`).join('\n')
  );
}

/** The result as displayed: embedded base64 stream audio is dropped (it is audio, not a result field). */
export function resultForJson(result: PipelineResult): PipelineResult {
  return {
    ...result,
    separation_results: result.separation_results?.map((r) => ({
      ...r,
      stream_a_audio_b64: r.stream_a_audio_b64 ? '[omitted]' : r.stream_a_audio_b64,
      stream_b_audio_b64: r.stream_b_audio_b64 ? '[omitted]' : r.stream_b_audio_b64,
    })),
  };
}

export function buildExport(
  format: ExportFormat,
  segments: TranscriptSegment[],
  result: PipelineResult,
): { content: string; mime: string } {
  switch (format) {
    case 'txt':
      return { content: toTxt(segments), mime: 'text/plain' };
    case 'srt':
      return { content: toSrt(segments), mime: 'application/x-subrip' };
    case 'vtt':
      return { content: toVtt(segments), mime: 'text/vtt' };
    case 'json':
      return { content: JSON.stringify(resultForJson(result), null, 2), mime: 'application/json' };
  }
}

export function safeStem(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'recording';
}

export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
