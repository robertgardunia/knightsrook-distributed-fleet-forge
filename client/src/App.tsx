import { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import FleetGraph from './components/FleetGraph';
import Sidebar from './components/Sidebar';
import MonitorPanel from './components/MonitorPanel';
import StatsPanel from './components/StatsPanel';
import ScreenPanel from './components/ScreenPanel';
import type { FleetGraph as FleetGraphData, FleetNode } from './types/fleet';



function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

async function callChaos(action: 'start' | 'stop') {
  await fetch(`/api/chaos/${action}`, { method: 'POST' });
}

export default function App() {
  const [graph, setGraph] = useState<FleetGraphData>({ nodes: [], links: [] });
  const [selected, setSelected] = useState<FleetNode | null>(null);
  const [labBusy, setLabBusy] = useState(false);
  const lastSelected = useRef<FleetNode | null>(null);
  if (selected) lastSelected.current = selected;
  const panelNode = selected ?? lastSelected.current;
  const open = selected !== null;
  const isMobile = useIsMobile();

  useEffect(() => {
    const requestGraph = () => socket.emit('fleet:request');
    socket.on('fleet:graph', setGraph);
    socket.on('connect', requestGraph);
    if (socket.connected) requestGraph();
    return () => {
      socket.off('fleet:graph', setGraph);
      socket.off('connect', requestGraph);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100dvh', background: '#0f172a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ height: 52, padding: '0 20px', borderBottom: '1px solid #1e293b', background: '#0d1f35', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Title */}
        <img src="/logo.png" alt="" style={{ height: 28, width: 28, flexShrink: 0 }} />
        <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', flexShrink: 0 }}>
          Distributed Fleet Forge
        </h1>

        {/* Search */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '0.8rem', pointerEvents: 'none' }}>⌕</span>
            <input
              placeholder="Search nodes…"
              style={{ width: '100%', background: '#061322', border: '1px solid #1e293b', borderRadius: 3, padding: '5px 10px 5px 26px', color: '#cbd5e1', fontSize: '0.7rem', outline: 'none', fontFamily: 'inherit', letterSpacing: '0.04em' }}
            />
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>

          {/* Close node button */}
          <div style={{
            opacity: open ? 1 : 0,
            transform: open ? 'translateY(0)' : 'translateY(-4px)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
            pointerEvents: open ? 'auto' : 'none',
            marginRight: 8,
          }}>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'transparent', border: '1px solid #334155', color: '#64748b', padding: '3px 10px', fontSize: '0.7rem', cursor: 'pointer', borderRadius: 2, letterSpacing: '0.05em' }}
            >
              ✕ {panelNode?.name}
            </button>
          </div>

          {/* Mode toggle */}
          {labBusy ? (
            <span style={{ color: '#475569', fontSize: '0.65rem', letterSpacing: '0.08em', padding: '0 8px' }}>…</span>
          ) : (
            <div style={{ display: 'flex', border: '1px solid #1e293b', borderRadius: 3, overflow: 'hidden', marginRight: 6 }}>
              {([
                { label: 'Offline Demo', active: graph.isMock !== false, action: 'stop'  as const },
                { label: 'Start Lab',    active: graph.isMock === false,  action: 'start' as const },
              ] as const).map(({ label, active, action }) => (
                <button
                  key={label}
                  disabled={active}
                  onClick={async () => { setLabBusy(true); await callChaos(action); setTimeout(() => setLabBusy(false), 1500); }}
                  style={{
                    background: active ? '#0d2a1a' : 'transparent',
                    border: 'none',
                    borderLeft: label === 'Start Lab' ? '1px solid #1e293b' : 'none',
                    color: active ? '#4ade80' : '#475569',
                    padding: '4px 12px',
                    fontSize: '0.65rem',
                    cursor: active ? 'default' : 'pointer',
                    letterSpacing: '0.08em',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Nav items */}
          {(['Fleet', 'Alerts', 'Settings'] as const).map(label => (
            <button key={label} style={{ background: 'transparent', border: 'none', color: '#475569', fontSize: '0.68rem', padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {label}
            </button>
          ))}

          <div style={{ width: 1, height: 16, background: '#1e293b', margin: '0 6px' }} />

          {/* Sign in */}
          <button style={{ background: '#0c2340', border: '1px solid #1e4a6e', color: '#7dd3fc', padding: '4px 14px', fontSize: '0.68rem', cursor: 'pointer', borderRadius: 2, letterSpacing: '0.08em' }}>
            Sign In
          </button>
        </div>

      </header>

      {isMobile ? (
        /* ── Mobile: stack panels vertically ── */
        <div style={{ flex: 1, minHeight: 0, overflow: open ? 'auto' : 'hidden' }}>
          {open && panelNode ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: '50vh', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
                <MonitorPanel node={panelNode} />
              </div>
              <div style={{ height: '50vh', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
                <FleetGraph graph={graph} onNodeSelect={setSelected} selectedNodeId={selected?.id} />
              </div>
              <div style={{ height: '50vh', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
                <StatsPanel node={panelNode} />
              </div>
              <div style={{ height: '50vh', flexShrink: 0 }}>
                <ScreenPanel node={panelNode} />
              </div>
            </div>
          ) : (
            <div style={{ height: '100%' }}>
              <FleetGraph graph={graph} onNodeSelect={setSelected} selectedNodeId={selected?.id} />
            </div>
          )}
        </div>
      ) : (
        /* ── Desktop: absolute 2×2 grid ── */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

            {/* Upper-left: Monitor */}
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '50%', height: '50%',
              opacity: open ? 1 : 0,
              transform: open ? 'none' : 'translateX(-14px)',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              pointerEvents: open ? 'auto' : 'none',
              borderRight: '1px solid #1e293b',
              borderBottom: '1px solid #1e293b',
              boxSizing: 'border-box',
            }}>
              {panelNode && <MonitorPanel node={panelNode} />}
            </div>

            {/* Upper-right: Fleet Graph — always mounted */}
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: open ? '50%' : '100%',
              height: open ? '50%' : '100%',
              transition: 'width 0.35s ease, height 0.35s ease',
              borderBottom: open ? '1px solid #1e293b' : 'none',
              boxSizing: 'border-box',
            }}>
              <FleetGraph graph={graph} onNodeSelect={setSelected} selectedNodeId={selected?.id} />
            </div>

            {/* Lower-left: Stats */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, width: '50%', height: '50%',
              opacity: open ? 1 : 0,
              transform: open ? 'none' : 'translateY(14px)',
              transition: 'opacity 0.32s ease 0.06s, transform 0.32s ease 0.06s',
              pointerEvents: open ? 'auto' : 'none',
              borderRight: '1px solid #1e293b',
              boxSizing: 'border-box',
            }}>
              {panelNode && <StatsPanel node={panelNode} />}
            </div>

            {/* Lower-right: Screen/Logs */}
            <div style={{
              position: 'absolute', bottom: 0, right: 0, width: '50%', height: '50%',
              opacity: open ? 1 : 0,
              transform: open ? 'none' : 'translateY(14px)',
              transition: 'opacity 0.35s ease 0.1s, transform 0.35s ease 0.1s',
              pointerEvents: open ? 'auto' : 'none',
              boxSizing: 'border-box',
            }}>
              {panelNode && <ScreenPanel node={panelNode} />}
            </div>

          </div>

          {/* Sidebar — hidden when node selected */}
          <div style={{
            width: open ? 0 : 280,
            overflow: 'hidden',
            flexShrink: 0,
            transition: 'width 0.35s ease',
          }}>
            <Sidebar graph={graph} selected={selected} onClose={() => setSelected(null)} />
          </div>

        </div>
      )}
    </div>
  );
}
