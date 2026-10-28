import { WorkbenchProvider } from './state/Workbench';
import { useWorkbench } from './state/store';
import LandingPage from './components/LandingPage';
import { Shell } from './components/Shell';
import { Dialog } from './components/ui';
import { Overview } from './workspaces/Overview';
import { AsrStudio } from './workspaces/AsrStudio';
import { Inspector } from './workspaces/Inspector';
import { RoutingLab } from './workspaces/RoutingLab';
import { Benchmarks } from './workspaces/Benchmarks';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['← / →', 'Seek 2 seconds (hold Shift for 10)'],
  ['↑ / ↓', 'Previous / next region or transcript segment'],
  ['?', 'Show or hide this reference'],
  ['Esc', 'Close the open dialog or menu'],
];

function Router() {
  const wb = useWorkbench();

  if (wb.view === 'landing') {
    return (
      <LandingPage
        onNavigate={(tab, preset) => {
          wb.navigate(tab);
          if (tab === 'studio' && preset) void wb.loadDemo(preset === 'overlap' ? 'overlap_two_speakers' : 'clean_single_speaker', { autoTranscribe: true });
        }}
      />
    );
  }

  return (
    <Shell>
      {wb.view === 'overview' && <Overview />}
      {wb.view === 'studio' && <AsrStudio />}
      {wb.view === 'inspector' && <Inspector />}
      {wb.view === 'routing' && <RoutingLab />}
      {wb.view === 'benchmarks' && <Benchmarks />}
      {wb.shortcutsOpen && (
        <Dialog title="Keyboard shortcuts" onClose={() => wb.setShortcutsOpen(false)}>
          <dl className="shortcuts">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt><kbd>{k}</kbd></dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="meta">Shortcuts are ignored while you are typing in a field or focused on a button or tab.</p>
        </Dialog>
      )}
    </Shell>
  );
}

export default function App() {
  return (
    <WorkbenchProvider>
      <Router />
    </WorkbenchProvider>
  );
}
