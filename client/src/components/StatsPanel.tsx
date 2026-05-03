import type { ReactNode } from 'react';
import type { FleetNode, NodeRole, NodeStatus } from '../types/fleet';

const TIER_LABEL: Record<NodeRole, string> = {
  'homebase':            'Tier 1 · Home Base',
  'station-controller':  'Tier 2 · Station Controller',
  'game-kiosk':          'Tier 3 · Game Kiosk',
  'info-kiosk':          'Tier 3 · Info Kiosk',
};

const STATUS_COLOR: Record<NodeStatus, string> = {
  federation: '#4ade80',
  island:     '#facc15',
  swarm:      '#fb923c',
  dead:       '#f87171',
};

function seed(id: string) {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr style={{ borderBottom: '1px solid #0f172a' }}>
      <td style={{ padding: '7px 14px', color: '#475569', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {label}
      </td>
      <td style={{ padding: '7px 14px', color: '#cbd5e1', fontSize: '0.72rem', fontFamily: '"Cascadia Code", "Fira Code", monospace' }}>
        {value}
      </td>
    </tr>
  );
}

export default function StatsPanel({ node }: { node: FleetNode }) {
  const s = seed(node.id);
  const days = s % 7;
  const hours = (s * 3) % 24;
  const mins = (s * 7) % 60;

  return (
    <div style={{ background: '#020c1b', borderRight: '1px solid #1e293b', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#475569', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Stats · {node.name}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <Row label="Status" value={
            <span style={{ color: STATUS_COLOR[node.status] }}>● {node.status}</span>
          } />
          <Row label="Role"   value={TIER_LABEL[node.role]} />
          <Row label="Uptime" value={`${days}d ${hours}h ${mins}m`} />
          <Row label="CPU"    value={`${((s % 40) + 18)}%`} />
          <Row label="RAM"    value={`${((s % 200) + 380)} MB / 1.5 GB`} />
          <Row label="Disk"   value={`${((s % 18) + 8).toFixed(1)} GB / 32 GB`} />
          <Row label="Net ↓"  value={`${((s % 25) / 10 + 0.4).toFixed(1)} KB/s`} />
          <Row label="Net ↑"  value={`${((s % 9) / 10 + 0.1).toFixed(1)} KB/s`} />
          <Row label="Ping"   value={`${(s % 8) + 2} ms`} />
          <Row label="ID"     value={<span style={{ color: '#64748b', fontSize: '0.65rem' }}>{node.id}</span>} />
        </tbody>
      </table>
    </div>
  );
}
