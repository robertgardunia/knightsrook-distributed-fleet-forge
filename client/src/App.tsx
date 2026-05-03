import FleetGraph from './components/FleetGraph';

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '10px 20px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Distributed Fleet Forge
        </h1>
      </header>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FleetGraph />
      </div>
    </div>
  );
}
