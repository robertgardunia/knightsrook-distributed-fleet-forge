import { useEffect, useRef, useState } from 'react';
import type { FleetGraph, FleetNode, NodeStatus } from '../types/fleet';

const STATUS_COLOR: Record<NodeStatus, string> = {
  federation: '#4ade80',
  island:     '#facc15',
  swarm:      '#fb923c',
  dead:       '#f87171',
};

function bar(pct: number, width = 12) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function seed(id: string) {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function Divider() {
  return <div style={{ borderTop: '1px solid #1e293b', margin: '10px 0' }} />;
}

function FleetOverview({ graph }: { graph: FleetGraph }) {
  const stations = graph.nodes.filter(n => n.role === 'station-controller');
  const kiosks   = graph.nodes.filter(n => n.role === 'game-kiosk' || n.role === 'info-kiosk');

  const counts = (['federation', 'island', 'swarm', 'dead'] as NodeStatus[]).map(s => ({
    status: s,
    count: graph.nodes.filter(n => n.status === s).length,
  }));

  const kiosksByStation = new Map(
    stations.map(st => [st.id, kiosks.filter(k => k.id.startsWith(st.id)).length])
  );

  return (
    <div style={{ padding: '12px 14px' }}>
      {counts.map(({ status, count }) => (
        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ color: STATUS_COLOR[status] }}>●</span>
          <span style={{ flex: 1, textTransform: 'uppercase', fontSize: '0.62rem', color: count > 0 && status !== 'federation' ? STATUS_COLOR[status] : '#475569' }}>
            {status}
          </span>
          <span style={{ color: count > 0 ? '#cbd5e1' : '#334155' }}>{count}</span>
        </div>
      ))}

      <Divider />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#475569' }}>STATIONS</span>
        <span style={{ color: '#94a3b8' }}>{stations.length}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: '#475569' }}>KIOSKS</span>
        <span style={{ color: '#94a3b8' }}>{kiosks.length}</span>
      </div>

      <Divider />

      {stations.map(st => (
        <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ color: STATUS_COLOR[st.status] }}>●</span>
          <span style={{ flex: 1, color: '#cbd5e1' }}>{st.name}</span>
          <span style={{ color: '#475569', fontSize: '0.62rem' }}>{kiosksByStation.get(st.id) ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

function NodeDetail({ node, onClose }: { node: FleetNode; onClose: () => void }) {
  const s = seed(node.id);
  const [cpu, setCpu] = useState(() => (s % 40) + 18);
  const baseMem = (s % 30) + 22;

  useEffect(() => {
    const id = setInterval(() => {
      setCpu(prev => Math.min(95, Math.max(5, prev + (Math.random() * 8 - 4))));
    }, 2000);
    return () => clearInterval(id);
  }, [node.id]);

  const roleLabel: Record<string, string> = {
    'homebase':            'Tier 1 · Home Base',
    'station-controller':  'Tier 2 · Station',
    'game-kiosk':          'Tier 3 · Game Kiosk',
    'info-kiosk':          'Tier 3 · Info Kiosk',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#f1f5f9', fontSize: '0.82rem', fontWeight: 600, marginBottom: 2 }}>{node.name}</div>
          <div style={{ color: '#475569', fontSize: '0.62rem', marginBottom: 4 }}>{roleLabel[node.role]}</div>
          <div style={{ color: STATUS_COLOR[node.status], fontSize: '0.63rem' }}>● {node.status}</div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 2px' }}>
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ color: '#475569' }}>CPU</span>
            <span style={{ color: '#4ade80', fontFamily: 'monospace' }}>{bar(cpu)} {cpu.toFixed(0)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#475569' }}>MEM</span>
            <span style={{ color: '#4ade80', fontFamily: 'monospace' }}>{bar(baseMem)} {baseMem}%</span>
          </div>
        </div>

        <Divider />

        {([
          ['UPTIME',  `${s % 7}d ${(s * 3) % 24}h`],
          ['PING',    `${(s % 8) + 2}ms`],
          ['NET ↓',   `${((s % 25) / 10 + 0.4).toFixed(1)} KB/s`],
          ['NET ↑',   `${((s % 9)  / 10 + 0.1).toFixed(1)} KB/s`],
          ['DISK',    `${((s % 18) + 8)}GB / 32GB`],
          ['ID',      node.id],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ color: '#475569', fontSize: '0.65rem' }}>{label}</span>
            <span style={{ color: label === 'ID' ? '#334155' : '#94a3b8', fontSize: '0.65rem', fontFamily: 'monospace', textAlign: 'right', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
          </div>
        ))}

        <Divider />

        <div style={{ color: '#475569', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 }}>Screen</div>
        <div style={{ background: '#000', borderRadius: 3, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #0f172a', marginBottom: 12, overflow: 'hidden' }}>
          {node.role === 'game-kiosk' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#facc15', fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace' }}>{((s * 137) % 99800).toLocaleString()}</div>
              <div style={{ color: '#4ade80', fontSize: '0.52rem', marginTop: 2 }}>▶ IN PROGRESS</div>
            </div>
          )}
          {node.role === 'info-kiosk' && (
            <div style={{ color: '#7dd3fc', fontSize: '0.58rem', textAlign: 'center', fontFamily: 'monospace' }}>
              <div>3:30 PM</div>
              <div style={{ color: '#f1f5f9', marginTop: 2 }}>Free Play</div>
            </div>
          )}
          {(node.role === 'homebase' || node.role === 'station-controller') && (
            <div style={{ color: '#4ade80', fontSize: '0.58rem', padding: '6px 10px', alignSelf: 'flex-start', width: '100%', fontFamily: 'monospace' }}>
              <div style={{ color: '#facc15' }}>$ fleet-agent status</div>
              <div>● active (running)</div>
            </div>
          )}
        </div>

        <button
          title="SSH not wired yet"
          style={{ width: '100%', background: '#0c2340', border: '1px solid #1e4a6e', color: '#7dd3fc', padding: '6px', fontSize: '0.68rem', cursor: 'not-allowed', borderRadius: 2, letterSpacing: '0.08em', opacity: 0.7, fontFamily: 'inherit' }}
        >
          SSH ↗
        </button>
      </div>
    </div>
  );
}

interface Props {
  graph: FleetGraph;
  selected: FleetNode | null;
  onClose: () => void;
}

export default function Sidebar({ graph, selected, onClose }: Props) {
  const [displayNode, setDisplayNode] = useState<FleetNode | null>(selected);
  const [opacity, setOpacity] = useState(1);
  const prevId = useRef(selected?.id);

  useEffect(() => {
    if (selected?.id === prevId.current) return;
    prevId.current = selected?.id;
    setOpacity(0);
    const t = setTimeout(() => {
      setDisplayNode(selected);
      setOpacity(1);
    }, 140);
    return () => clearTimeout(t);
  }, [selected?.id]);

  return (
    <div style={{
      width: 280,
      height: '100%',
      flexShrink: 0,
      background: '#020c1b',
      borderLeft: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontSize: '0.7rem',
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      color: '#94a3b8',
    }}>
      <div style={{ padding: '7px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#334155', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {displayNode ? 'Node Detail' : 'Fleet Status'}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', opacity, transition: 'opacity 0.14s ease' }}>
        {displayNode
          ? <NodeDetail node={displayNode} onClose={onClose} />
          : <FleetOverview graph={graph} />
        }
      </div>
    </div>
  );
}
