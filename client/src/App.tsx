import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import FleetGraph from './components/FleetGraph';
import Sidebar from './components/Sidebar';
import type { FleetGraph as FleetGraphData, FleetNode } from './types/fleet';

const socket = io();

export default function App() {
  const [graph, setGraph] = useState<FleetGraphData>({ nodes: [], links: [] });
  const [selected, setSelected] = useState<FleetNode | null>(null);

  useEffect(() => {
    socket.on('fleet:graph', setGraph);
    return () => { socket.off('fleet:graph', setGraph); };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '8px 20px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Distributed Fleet Forge
        </h1>
      </header>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <FleetGraph graph={graph} onNodeSelect={setSelected} selectedNodeId={selected?.id} />
        </div>
        <Sidebar graph={graph} selected={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}
