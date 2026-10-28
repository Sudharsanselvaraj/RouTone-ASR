import { useState } from 'react';
import { AudioWaveform, FileText, Layers } from 'lucide-react';
import type { ReactNode } from 'react';

interface Card {
  id: string;
  num: string;
  title: string;
  body: string;
  /** Scattered squares on the resting card: [left %, top %, opacity]. */
  squares: [number, number, number][];
  stage: ReactNode;
}

const BARS = [14, 22, 30, 18, 26, 40, 52, 44, 58, 48, 62, 54, 46, 38, 50, 42, 30, 24, 34, 20, 28, 16, 22, 12];

const CARDS: Card[] = [
  {
    id: 'mixture',
    num: '01.',
    title: 'Mixture-first ASR',
    body: 'Transcribes the original recording first, with word timestamps and confidence, so clean speech never pays for separation.',
    squares: [[70, 42, 1], [63, 51, 0.3], [80, 56, 0.2], [67, 65, 0.65], [80, 74, 0.65]],
    stage: (
      <>
        <div className="fc-bubble">Transcribe the whole mixture first.</div>
        <span className="fc-mark" aria-hidden="true">
          <AudioWaveform size={14} strokeWidth={2.4} />
        </span>
      </>
    ),
  },
  {
    id: 'overlap',
    num: '02.',
    title: 'Overlap detection',
    body: 'Flags candidate overlap regions with an acoustic heuristic: pitch clash, spectral spread and energy shifts.',
    squares: [[70, 43, 1], [63, 51, 0.3], [80, 56, 0.2], [47, 61, 0.65], [66, 65, 0.65], [38, 67, 0.65], [80, 74, 0.65]],
    stage: (
      <div className="fc-panel fc-wave-panel">
        <div className="fc-panel-head"><i className="fc-dot" /> OVERLAP CANDIDATES</div>
        <div className="fc-wave" aria-hidden="true">
          {BARS.map((h, i) => (
            <b key={i} style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }} />
          ))}
          <span className="fc-region" />
        </div>
        <div className="fc-wave-foot"><span>0:00</span><em>candidate region</em><span>0:05</span></div>
      </div>
    ),
  },
  {
    id: 'routing',
    num: '03.',
    title: 'Benefit-aware routing',
    body: 'Weighs predicted recognition benefit against estimated latency for each region, and separates only when it is worth it.',
    squares: [[70, 43, 1], [32, 52, 1], [60, 54, 1], [80, 56, 0.25], [23, 58, 0.65], [12, 65, 0.65], [66, 65, 0.65], [48, 65, 0.25], [38, 67, 0.65], [45, 72, 0.65], [80, 74, 0.65]],
    stage: (
      <div className="fc-panel fc-plan">
        <div className="fc-panel-head"><i className="fc-dot" /> ROUTING PLAN</div>
        <ul>
          {['Transcribe the mixture', 'Flag overlap regions', 'Separate when worth the cost'].map((t, i) => (
            <li key={t} style={{ ['--i' as string]: i }}><span className="fc-check" aria-hidden="true" />{t}</li>
          ))}
          <li className="is-pending"><span className="fc-check" aria-hidden="true" />Reconcile transcripts</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'evaluation',
    num: '04.',
    title: 'Measured evaluation',
    body: 'Reports WER, speaker-attributed WER and latency per strategy, and says plainly when an experiment is too small or invalid.',
    squares: [[70, 43, 1], [60, 52, 0.65], [80, 56, 0.25], [48, 59, 0.65], [67, 65, 1], [78, 74, 0.65], [42, 74, 0.65], [25, 74, 1], [60, 74, 0.65]],
    stage: (
      <>
        <div className="fc-flow" aria-hidden="true">
          <span className="fc-tile"><AudioWaveform size={22} /></span>
          <span className="fc-dots"><i /><i /><i /></span>
          <span className="fc-tile"><Layers size={22} /></span>
          <span className="fc-dots is-dark"><i /><i /><i /></span>
          <span className="fc-tile"><FileText size={22} /></span>
        </div>
        <div className="fc-pill"><i className="fc-dot" /> Measured, not assumed <small>· REAL RUNS</small></div>
      </>
    ),
  },
];

export function FeatureCards() {
  const [active, setActive] = useState(0);
  return (
    <div className="fc-row" role="group" aria-label="How Routone works">
      {CARDS.map((c, i) => {
        const on = i === active;
        return (
          <div
            key={c.id}
            className={`fc ${on ? 'is-active' : ''}`}
            tabIndex={0}
            role="button"
            aria-expanded={on}
            aria-label={c.title}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setActive((i + 1) % CARDS.length);
              if (e.key === 'ArrowLeft') setActive((i - 1 + CARDS.length) % CARDS.length);
            }}
          >
            <div className="fc-rest" aria-hidden={on}>
              <span className="fc-num">{c.num}</span>
              {c.squares.map(([x, y, o], k) => (
                <i key={k} className="fc-sq" style={{ left: `${x}%`, top: `${y}%`, opacity: o, ['--k' as string]: k }} />
              ))}
              <h3>{c.title}</h3>
            </div>
            <div className="fc-open" aria-hidden={!on}>
              <div className="fc-stage">{c.stage}</div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
