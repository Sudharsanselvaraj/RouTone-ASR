/** Speaker identity colours, shared by waveform lanes, transcript rows and the timeline. */

const PALETTE = ['#3F6E8C', '#8A5A83', '#5E7F4F', '#A0714A', '#6B6FA3'];

const known = new Map<string, string>();

export function speakerColor(name: string): string {
  const hit = known.get(name);
  if (hit) return hit;
  const m = /(\d+)\s*$/.exec(name);
  const idx = m ? (parseInt(m[1], 10) - 1) % PALETTE.length : known.size % PALETTE.length;
  const color = PALETTE[(idx + PALETTE.length) % PALETTE.length];
  known.set(name, color);
  return color;
}

export function sourceLabel(path: string): string {
  switch (path) {
    case 'mixture':
      return 'Mixture';
    case 'mixture_fallback':
      return 'Mixture (fallback)';
    case 'separated_stream_a':
      return 'Stream A';
    case 'separated_stream_b':
      return 'Stream B';
    default:
      return path;
  }
}
