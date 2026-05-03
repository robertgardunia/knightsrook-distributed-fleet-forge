import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import FleetGraph from './components/FleetGraph';
import Sidebar from './components/Sidebar';
import MonitorPanel from './components/MonitorPanel';
import StatsPanel from './components/StatsPanel';
import ScreenPanel from './components/ScreenPanel';
import type { FleetGraph as FleetGraphData, FleetNode } from './types/fleet';

const socket = io();

export default function App() {
  const [graph, setGraph] = useState<FleetGraphData>({ nodes: [], links: [] });
  const [selected, setSelected] = useState<FleetNode | null>(null);
  const lastSelected = useRef<FleetNode | null>(null);
  if (selected) lastSelected.current = selected;
  const panelNode = selected ?? lastSelected.current;
  const open = selected !== null;

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
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '8px 20px', borderBottom: '1px solid #1e293b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Distributed Fleet Forge
        </h1>
        <div style={{
          marginLeft: 'auto',
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: open ? 'auto' : 'none',
        }}>
          <button
            onClick={() => setSelected(null)}
            style={{ background: 'transparent', border: '1px solid #334155', color: '#64748b', padding: '2px 10px', fontSize: '0.7rem', cursor: 'pointer', borderRadius: 2, letterSpacing: '0.05em' }}
          >
            ✕ {panelNode?.name}
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left area — fleet graph (full) or 2×2 panels (node selected) */}
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

          {/* Lower-right: Screen */}
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

        {/* Right area — always-on sidebar */}
        <Sidebar graph={graph} selected={selected} onClose={() => setSelected(null)} />

      </div>
    </div>
  );
}
