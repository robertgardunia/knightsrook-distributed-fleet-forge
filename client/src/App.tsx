import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import FleetGraph, { type FleetGraphHandle } from './components/FleetGraph';
import Sidebar from './components/Sidebar';
import MonitorPanel from './components/MonitorPanel';
import StatsPanel from './components/StatsPanel';
import ScreenPanel from './components/ScreenPanel';
import type { FleetGraph as FleetGraphData, FleetNode } from './types/fleet';



const ROLE_LABEL: Record<string, string> = {
  'homebase': 'Home Base',
  'station-controller': 'Station Controller',
  'game-kiosk': 'Game Kiosk',
  'info-kiosk': 'Info Kiosk',
};

function SearchBox({ nodes, onSelect, query, setQuery, open, setOpen }: {
  nodes: FleetNode[];
  onSelect: (n: FleetNode) => void;
  query: string;
  setQuery: (q: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = query.trim().length === 0 ? [] : nodes.filter(n => {
    const q = query.toLowerCase();
    return n.name.toLowerCase().includes(q)
      || n.role.toLowerCase().includes(q)
      || n.id.toLowerCase().includes(q)
      || (n.location ?? '').toLowerCase().includes(q);
  }).slice(0, 10);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setOpen]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '0.8rem', pointerEvents: 'none' }}>⌕</span>
      <input
        value={query}
        placeholder="Search nodes…"
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (query) setOpen(true); }}
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
        style={{ width: '100%', background: '#061322', border: `1px solid ${open && results.length ? '#334155' : '#1e293b'}`, borderRadius: open && results.length ? '3px 3px 0 0' : 3, padding: '5px 10px 5px 26px', color: '#cbd5e1', fontSize: '0.7rem', outline: 'none', fontFamily: 'inherit', letterSpacing: '0.04em' }}
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#061322', border: '1px solid #334155', borderTop: 'none', borderRadius: '0 0 3px 3px', zIndex: 100, maxHeight: 260, overflowY: 'auto' }}>
          {results.map(n => (
            <div
              key={n.id}
              onMouseDown={() => onSelect(n)}
              style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #0f172a' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0d1f35')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: n.color, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#f1f5f9', fontSize: '0.72rem', fontWeight: 600 }}>{n.name}</div>
                <div style={{ color: '#475569', fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ROLE_LABEL[n.role]}{n.location ? ` · ${n.location}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [labMode, setLabMode] = useState<'demo' | 'lab'>('demo');
  const labModeRef = useRef(labMode);
  labModeRef.current = labMode;
  const [hSplit, setHSplit] = useState(50); // left col %
  const [vSplit, setVSplit] = useState(50); // top row %
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const fgHandle = useRef<FleetGraphHandle>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const isForging = labMode === 'lab' && graph.isMock !== false;

  const visibleGraph = (() => {
    if (labMode === 'demo' && graph.isMock !== true)  return { nodes: [], links: [], isMock: false as const };
    if (labMode === 'lab'  && graph.isMock !== false) return { nodes: [], links: [], isMock: true  as const };
    return graph;
  })();

  const lastSelected = useRef<FleetNode | null>(null);
  if (selected) lastSelected.current = selected;
  const panelNode = selected ?? lastSelected.current;
  const open = selected !== null;
  const isMobile = useIsMobile();

  const startHDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setHSplit(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const startVDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setVSplit(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const requestGraph = useCallback(() => {
    socket.emit('fleet:request', { mock: labModeRef.current === 'demo' });
  }, []);

  const handleGraph = useCallback((data: FleetGraphData) => {
    if (labModeRef.current === 'demo' && data.isMock !== true) {
      requestGraph();
      return;
    }
    setGraph(data);
  }, [requestGraph]);

  useEffect(() => {
    socket.on('fleet:graph', handleGraph);
    socket.on('connect', requestGraph);
    if (socket.connected) requestGraph();
    return () => {
      socket.off('fleet:graph', handleGraph);
      socket.off('connect', requestGraph);
    };
  }, [handleGraph, requestGraph]);

  // On mode change: clear graph when going to demo (fresh mock), just re-request for lab
  useEffect(() => {
    if (labMode === 'demo') setGraph({ nodes: [], links: [] });
    if (socket.connected) requestGraph();
  }, [labMode, requestGraph]);

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
          <SearchBox nodes={visibleGraph.nodes} onSelect={node => { setSelected(node); fgHandle.current?.zoomToNode(node.id); setSearchQuery(''); setSearchOpen(false); }} query={searchQuery} setQuery={setSearchQuery} open={searchOpen} setOpen={setSearchOpen} />
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
          <div style={{ display: 'flex', border: '1px solid #1e293b', borderRadius: 3, overflow: 'hidden', marginRight: 6 }}>
            {([
              { label: 'Offline Demo', mode: 'demo' as const, action: 'stop'  as const },
              { label: 'Online Lab',   mode: 'lab'  as const, action: 'start' as const },
            ] as const).map(({ label, mode, action }) => (
              <button
                key={label}
                disabled={labBusy || labMode === mode}
                onClick={async () => { setLabBusy(true); setLabMode(mode); await callChaos(action); setTimeout(() => setLabBusy(false), 1500); }}
                style={{
                  background: labMode === mode ? '#0d2a1a' : 'transparent',
                  border: 'none',
                  borderLeft: label === 'Online Lab' ? '1px solid #1e293b' : 'none',
                  color: labMode === mode ? '#4ade80' : '#475569',
                  padding: '4px 12px',
                  fontSize: '0.65rem',
                  cursor: labBusy || labMode === mode ? 'default' : 'pointer',
                  letterSpacing: '0.08em',
                  transition: 'all 0.2s ease',
                  opacity: labBusy && labMode !== mode ? 0.4 : 1,
                }}
              >
                {label}
              </button>
            ))}
          </div>

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
                <MonitorPanel node={panelNode} isMock={visibleGraph.isMock !== false} />
              </div>
              <div style={{ height: '50vh', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
                <FleetGraph ref={fgHandle} graph={visibleGraph} onNodeSelect={setSelected} selectedNodeId={selected?.id} />
              </div>
              <div style={{ height: '50vh', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
                <StatsPanel node={panelNode} isMock={visibleGraph.isMock !== false} />
              </div>
              <div style={{ height: '50vh', flexShrink: 0 }}>
                <ScreenPanel node={panelNode} isMock={visibleGraph.isMock !== false} />
              </div>
            </div>
          ) : (
            <div style={{ height: '100%' }}>
              <FleetGraph ref={fgHandle} graph={visibleGraph} onNodeSelect={setSelected} selectedNodeId={selected?.id} />
            </div>
          )}
        </div>
      ) : (
        /* ── Desktop: absolute 2×2 grid ── */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          <div ref={gridRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

            {/* Upper-left: Monitor */}
            <div style={{
              position: 'absolute', top: 0, left: 0,
              width: `${hSplit}%`, height: `${vSplit}%`,
              opacity: open ? 1 : 0,
              transform: open ? 'none' : 'translateX(-14px)',
              transition: open ? 'opacity 0.3s ease, transform 0.3s ease' : 'opacity 0.3s ease, transform 0.3s ease',
              pointerEvents: open ? 'auto' : 'none',
              borderRight: '1px solid #1e293b',
              borderBottom: '1px solid #1e293b',
              boxSizing: 'border-box',
            }}>
              {panelNode && <MonitorPanel node={panelNode} isMock={visibleGraph.isMock !== false} />}
            </div>

            {/* Upper-right: Fleet Graph — always mounted */}
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: open ? `${100 - hSplit}%` : '100%',
              height: open ? `${vSplit}%` : '100%',
              transition: 'width 0.35s ease, height 0.35s ease',
              borderBottom: open ? '1px solid #1e293b' : 'none',
              boxSizing: 'border-box',
            }}>
              <div style={{ position: 'absolute', inset: 0, opacity: isForging ? 0.25 : 1, transition: 'opacity 0.4s ease' }}>
                <FleetGraph ref={fgHandle} graph={visibleGraph} onNodeSelect={setSelected} selectedNodeId={selected?.id} />
              </div>
              {isForging && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'rgba(15,23,42,0.55)' }}>
                  <span className="forging-label">Forging Network</span>
                </div>
              )}
            </div>

            {/* Lower-left: Stats */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0,
              width: `${hSplit}%`, height: `${100 - vSplit}%`,
              opacity: open ? 1 : 0,
              transform: open ? 'none' : 'translateY(14px)',
              transition: 'opacity 0.32s ease 0.06s, transform 0.32s ease 0.06s',
              pointerEvents: open ? 'auto' : 'none',
              borderRight: '1px solid #1e293b',
              boxSizing: 'border-box',
            }}>
              {panelNode && <StatsPanel node={panelNode} isMock={visibleGraph.isMock !== false} />}
            </div>

            {/* Lower-right: Screen/Logs */}
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: `${100 - hSplit}%`, height: `${100 - vSplit}%`,
              opacity: open ? 1 : 0,
              transform: open ? 'none' : 'translateY(14px)',
              transition: 'opacity 0.35s ease 0.1s, transform 0.35s ease 0.1s',
              pointerEvents: open ? 'auto' : 'none',
              boxSizing: 'border-box',
            }}>
              {panelNode && <ScreenPanel node={panelNode} isMock={visibleGraph.isMock !== false} />}
            </div>

            {/* Vertical drag handle */}
            {open && (
              <div
                onMouseDown={startHDrag}
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${hSplit}%`,
                  width: 8,
                  transform: 'translateX(-50%)',
                  cursor: 'col-resize',
                  zIndex: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{ width: 2, height: '40%', background: '#1e3a5f', borderRadius: 1, opacity: 0.6 }} />
              </div>
            )}

            {/* Horizontal drag handle */}
            {open && (
              <div
                onMouseDown={startVDrag}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${vSplit}%`,
                  height: 8,
                  transform: 'translateY(-50%)',
                  cursor: 'row-resize',
                  zIndex: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{ height: 2, width: '40%', background: '#1e3a5f', borderRadius: 1, opacity: 0.6 }} />
              </div>
            )}

          </div>

          {/* Sidebar — hidden when node selected */}
          <div style={{
            width: open ? 0 : 280,
            overflow: 'hidden',
            flexShrink: 0,
            transition: 'width 0.35s ease',
          }}>
            <Sidebar graph={visibleGraph} selected={selected} onClose={() => setSelected(null)} />
          </div>

        </div>
      )}
    </div>
  );
}
