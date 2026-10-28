/** Formatting helpers. All return a visible placeholder for missing data, never a fake zero. */

export const DASH = '—';

export function fmtNum(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(v) ? DASH : v.toFixed(digits);
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  return v == null || !Number.isFinite(v) ? DASH : `${(v * 100).toFixed(digits)}%`;
}

export function fmtMs(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(digits)} ms`;
}

/** 83.4 -> "1:23.40" */
export function fmtClock(sec: number | null | undefined, digits = 2): string {
  if (sec == null || !Number.isFinite(sec)) return DASH;
  const total = Math.max(0, sec);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const sFixed = s.toFixed(digits);
  const [whole, frac] = sFixed.split('.');
  return `${m}:${whole.padStart(2, '0')}${frac ? '.' + frac : ''}`;
}

export function fmtSec(sec: number | null | undefined, digits = 2): string {
  return sec == null || !Number.isFinite(sec) ? DASH : `${sec.toFixed(digits)}s`;
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return DASH;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  // Backend timestamps without a zone are UTC.
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
  return Number.isNaN(d.getTime())
    ? DASH
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Builds "a, b and c" style lists. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
