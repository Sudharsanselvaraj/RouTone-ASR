import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { DECISION_LABEL, DECISION_SHORT } from '../lib/analysis';
import type { RoutingMode } from '../types';

/* Wordmark: two offset waveforms that overlap, drawn as plain geometry. */
export function WordmarkMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="wordmark-mark">
      <path d="M2 12c2.2-6 4.4-6 6.6 0s4.4 6 6.6 0 4.4-6 6.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2 12c2.2 6 4.4 6 6.6 0s4.4-6 6.6 0 4.4 6 6.6 0" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark">
      <WordmarkMark size={size} />
      <span className="wordmark-text">Routone</span>
    </span>
  );
}

export type Tone = 'neutral' | 'accent' | 'green' | 'red' | 'amber' | 'ink';

export function Chip({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`chip chip-${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Provenance tags: what kind of quantity a number is. */
export function Provenance({ kind }: { kind: 'measured' | 'estimate' | 'heuristic' | 'default' }) {
  const map = {
    measured: { tone: 'green' as Tone, label: 'Measured', tip: 'Computed from the audio or timed during this run.' },
    estimate: { tone: 'amber' as Tone, label: 'Estimate', tip: 'A model-based estimate, not a measurement.' },
    heuristic: { tone: 'accent' as Tone, label: 'Heuristic', tip: 'Output of a hand-set, uncalibrated rule. Not a verified probability.' },
    default: { tone: 'neutral' as Tone, label: 'Fixed default', tip: 'A constant in the implementation, not derived from this audio.' },
  }[kind];
  return (
    <Chip tone={map.tone} title={map.tip}>
      {map.label}
    </Chip>
  );
}

export function InfoHint({ text }: { text: string }) {
  const id = useId();
  return (
    <span className="hint">
      <button type="button" className="hint-btn" aria-label={text} aria-describedby={id}>
        <Info size={13} aria-hidden="true" />
      </button>
      <span role="tooltip" id={id} className="hint-tip">
        {text}
      </span>
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; badge?: string | number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          className={value === o.id ? 'is-active' : ''}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.id === value);
            if (e.key === 'ArrowRight') onChange(options[(i + 1) % options.length].id);
            if (e.key === 'ArrowLeft') onChange(options[(i - 1 + options.length) % options.length].id);
          }}
        >
          {o.label}
          {o.badge != null && <span className="segmented-badge">{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Banner({ tone, title, children, onClose }: { tone: 'red' | 'amber' | 'green' | 'neutral'; title?: string; children?: ReactNode; onClose?: () => void }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'red' ? 'alert' : 'status'}>
      <div className="banner-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} aria-label="Dismiss">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p className="page-lede">{children}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  hint,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`}>
      {(title || actions) && (
        <div className="section-head">
          {title && (
            <h2>
              {title}
              {hint && <InfoHint text={hint} />}
            </h2>
          )}
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function KV({ rows }: { rows: { k: ReactNode; v: ReactNode; tag?: ReactNode }[] }) {
  return (
    <dl className="kv">
      {rows.map((r, i) => (
        <div className="kv-row" key={i}>
          <dt>{r.k}</dt>
          <dd>
            <span className="mono">{r.v}</span>
            {r.tag}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DecisionBadge({ mode, long }: { mode: RoutingMode | undefined; long?: boolean }) {
  if (!mode) return <span className="dim">—</span>;
  return (
    <span className={`decision decision-${mode}`}>
      <i aria-hidden="true" />
      {long ? DECISION_LABEL[mode] : DECISION_SHORT[mode]}
    </span>
  );
}
