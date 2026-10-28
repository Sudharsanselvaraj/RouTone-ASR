/** Real audio analysis: decodes the selected recording and derives amplitude peaks. */

export interface DecodedAudio {
  /** Mono mix at the decoder's sample rate. */
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  channels: number;
}

export async function decodeAudio(blob: Blob): Promise<DecodedAudio> {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('This browser cannot decode audio (no Web Audio API).');
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < buf.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
    }
    return { samples: mono, sampleRate: buf.sampleRate, duration: buf.duration, channels: buf.numberOfChannels };
  } finally {
    void ctx.close();
  }
}

/** Min/max envelope over [t0, t1) in `buckets` columns: [min0, max0, min1, max1, ...]. */
export function computePeaks(
  samples: Float32Array,
  sampleRate: number,
  buckets: number,
  t0 = 0,
  t1 = samples.length / sampleRate,
): Float32Array {
  const out = new Float32Array(buckets * 2);
  const start = Math.max(0, Math.floor(t0 * sampleRate));
  const end = Math.min(samples.length, Math.ceil(t1 * sampleRate));
  const span = Math.max(1, end - start);
  for (let b = 0; b < buckets; b++) {
    const i0 = start + Math.floor((b / buckets) * span);
    const i1 = Math.max(i0 + 1, start + Math.floor(((b + 1) / buckets) * span));
    let lo = 0;
    let hi = 0;
    for (let i = i0; i < i1 && i < samples.length; i++) {
      const v = samples[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[b * 2] = lo;
    out[b * 2 + 1] = hi;
  }
  return out;
}

/** Reads the sample rate from a RIFF/WAVE header; null for any other container. */
export async function readWavSampleRate(blob: Blob): Promise<number | null> {
  const head = new DataView(await blob.slice(0, 44).arrayBuffer());
  if (head.byteLength < 28) return null;
  const tag = (o: number) => String.fromCharCode(head.getUint8(o), head.getUint8(o + 1), head.getUint8(o + 2), head.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  return head.getUint32(24, true);
}

export function base64ToBlob(b64: string, type = 'audio/wav'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m));
}

/** Encodes mono float samples as a 16-bit PCM WAV blob (used to play an exact slice of the recording). */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
