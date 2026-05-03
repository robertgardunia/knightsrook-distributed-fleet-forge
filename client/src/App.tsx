import { useState } from 'react';
import FleetGraph from './components/FleetGraph';
import MonitorPanel from './components/MonitorPanel';
import StatsPanel from './components/StatsPanel';
import ScreenPanel from './components/ScreenPanel';
import type { FleetNode } from './types/fleet';

export default function App() {
  const [selected, setSelected] = useState<FleetNode | null>(null);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '8px 20px', borderBottom: '1px solid #1e293b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Distributed Fleet Forge
        </h1>
        {selected && (
          <button
            onClick={() => setSelected(null)}
            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #334155', color: '#64748b', padding: '2px 10px', fontSize: '0.7rem', cursor: 'pointer', borderRadius: 2, letterSpacing: '0.05em' }}
          >
            ✕ {selected.name}
          </button>
        )}
      </header>

      {selected ? (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', overflow: 'hidden' }}>
          <MonitorPanel node={selected} />
          <FleetGraph onNodeSelect={setSelected} selectedNodeId={selected.id} />
          <StatsPanel node={selected} />
          <ScreenPanel node={selected} />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <FleetGraph onNodeSelect={setSelected} />
        </div>
      )}
    </div>
  );
}
