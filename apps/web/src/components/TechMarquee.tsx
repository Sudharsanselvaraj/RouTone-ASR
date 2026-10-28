import { asset } from '../lib/assets';

interface Tech {
  name: string;
  src: string;
  role: string;
  status: 'in use' | 'planned';
  /** Logos that are wide wordmarks need less height. */
  wide?: boolean;
}

/**
 * Real project logos. "in use" means the package is a dependency of this repo (or of faster-whisper);
 * "planned" means it is on the roadmap and not yet wired in.
 */
const TECH: Tech[] = [
  { name: 'PyTorch', src: '/logos/pytorch.svg', role: 'Neural audio processing and model inference', status: 'in use' },
  { name: 'Hugging Face', src: '/logos/huggingface.svg', role: 'Model hub; Transformers speech architectures are planned', status: 'in use' },
  { name: 'torchaudio', src: '/logos/torchaudio.png', role: 'Audio transforms and the ConvTasNet separation bundle', status: 'in use' },
  { name: 'librosa', src: '/logos/librosa.svg', role: 'Spectral features and signal analysis for overlap detection', status: 'in use', wide: true },
  { name: 'FFmpeg', src: '/logos/ffmpeg.svg', role: 'Audio decoding, conversion and resampling (via PyAV)', status: 'in use' },
  { name: 'Silero VAD', src: '/logos/silero.png', role: 'Voice activity detection inside faster-whisper', status: 'in use' },
  { name: 'ONNX Runtime', src: '/logos/onnx.svg', role: 'Runs the VAD model; wider model export is planned', status: 'in use' },
  { name: 'scikit-learn', src: '/logos/scikitlearn.svg', role: 'Statistical analysis and evaluation tools', status: 'in use' },
  { name: 'MLflow', src: '/logos/mlflow.svg', role: 'Experiment tracking and comparison', status: 'planned' },
  { name: 'pytest', src: '/logos/pytest.svg', role: 'Backend testing and regression checks', status: 'in use' },
  { name: 'Docker', src: '/logos/docker.svg', role: 'Reproducible environments and deployment', status: 'planned' },
];

function Row({ items, reverse }: { items: Tech[]; reverse?: boolean }) {
  // The set is rendered twice so the loop is seamless; the copy is hidden from assistive tech.
  const set = (hidden: boolean) =>
    items.map((t) => (
      <li className="tech-tile" key={`${t.name}${hidden}`} aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : 0} title={`${t.name} · ${t.role} (${t.status})`}>
        <img src={asset(t.src)} alt={hidden ? '' : t.name} className={t.wide ? 'is-wide' : ''} loading="lazy" draggable={false} />
        <span className="tech-name">{t.name}{t.status === 'planned' ? ' · planned' : ''}</span>
      </li>
    ));
  return (
    <ul className={`tech-row ${reverse ? 'is-reverse' : ''}`}>
      {set(false)}
      {set(true)}
    </ul>
  );
}

export function TechMarquee() {
  const half = Math.ceil(TECH.length / 2);
  const top = TECH.slice(0, half);
  const bottom = [...TECH.slice(half), ...TECH.slice(0, 2)];
  return (
    <div className="tech-marquee" role="group" aria-label="Technologies used by Routone">
      <Row items={top} />
      <Row items={bottom} reverse />
    </div>
  );
}
