import { useState } from 'react';
import type { ReactNode } from 'react';
import { BarChart3, Cpu, Keyboard, Layers, LayoutGrid, Menu, Mic2, X, ArrowUpRight } from 'lucide-react';
import { useWorkbench } from '../state/store';
import type { View } from '../state/store';
import { Banner, Wordmark } from './ui';
import { StatusPanel } from './StatusPanel';

const NAV: { id: Exclude<View, 'landing'>; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} /> },
  { id: 'studio', label: 'ASR Studio', icon: <Mic2 size={16} /> },
  { id: 'inspector', label: 'Overlap Inspector', icon: <Layers size={16} /> },
  { id: 'routing', label: 'Adaptive Routing Lab', icon: <Cpu size={16} /> },
  { id: 'benchmarks', label: 'Benchmarks', icon: <BarChart3 size={16} /> },
];

const HOSTED = !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export function Shell({ children }: { children: ReactNode }) {
  const wb = useWorkbench();
  const [menu, setMenu] = useState(false);
  const busy = wb.operation.kind !== 'idle' || wb.mic.recording;

  const nav = (
    <nav className="nav" aria-label="Workspaces">
      {NAV.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`nav-item ${wb.view === n.id ? 'is-active' : ''}`}
          aria-current={wb.view === n.id ? 'page' : undefined}
          onClick={() => {
            setMenu(false);
            wb.navigate(n.id);
          }}
        >
          {n.icon}
          <span>{n.label}</span>
          {n.id === 'studio' && wb.result && <i className="nav-dot" title="A result is loaded" />}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar">
        <div className="sidebar-top">
          <button type="button" className="brand" onClick={() => wb.navigate('overview')} aria-label="Routone overview">
            <Wordmark />
          </button>
          <button type="button" className="icon-btn menu-btn" aria-expanded={menu} aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu((m) => !m)}>
            {menu ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <div className={`sidebar-body ${menu ? 'is-open' : ''}`}>
          {nav}
          <div className="sidebar-foot">
            <StatusPanel />
            <div className="sidebar-links">
              <button type="button" className="link-btn" onClick={() => wb.setShortcutsOpen(true)}>
                <Keyboard size={14} aria-hidden="true" /> Shortcuts <kbd>?</kbd>
              </button>
              <button type="button" className="link-btn" onClick={() => wb.navigate('landing')}>
                About Routone <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main id="main" className="main" tabIndex={-1}>
        {busy && <div className="progress-line" aria-hidden="true" />}
        {wb.backend === 'offline' && (
          <Banner tone="amber" title="Backend not reachable">
            {HOSTED ? (
              <>
                This is the hosted interface; it has no server of its own. To transcribe or evaluate, run the API on your machine
                (<code>make server</code>) and reload this page. It connects to <code>localhost:8000</code> from Chrome, Edge or Firefox.
              </>
            ) : (
              <>
                Routone can’t reach its API at the configured address, so nothing can be transcribed or evaluated. Start it with <code>make server</code>.
              </>
            )}
          </Banner>
        )}
        {wb.error && (
          <Banner tone="red" title="Something went wrong" onClose={wb.clearError}>
            {wb.error}
          </Banner>
        )}
        <div key={wb.view} className="view">
          {children}
        </div>
      </main>
    </div>
  );
}
