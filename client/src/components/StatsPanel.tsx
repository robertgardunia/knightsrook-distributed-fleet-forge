import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { socket } from '../socket';
import type { FleetNode, NodeRole, NodeStatus, NodeStats } from '../types/fleet';

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
      <td style={{ padding: '7px 14px', color: '#cbd5e1', fontSize: '0.72rem' }}>
        {value}
      </td>
    </tr>
  );
}

function StatsView({ node, live }: { node: FleetNode; live?: NodeStats }) {
  const s = seed(node.id);
  const days   = live ? Math.floor(live.uptime / 86400)  : s % 7;
  const hours  = live ? Math.floor((live.uptime % 86400) / 3600) : (s * 3) % 24;
  const mins   = live ? Math.floor((live.uptime % 3600) / 60)   : (s * 7) % 60;
  const cpuVal = live ? `${live.cpu.toFixed(1)}%` : `${((s % 40) + 18)}%`;
  const memVal = live
    ? `${(live.memUsed / (1024*1024)).toFixed(0)} MB / ${(live.memTotal / (1024*1024)).toFixed(0)} MB`
    : `${((s % 200) + 380)} MB / 1.5 GB`;
  const netInVal  = live ? `${(live.netInRate  / 1024).toFixed(1)} KB/s` : `${((s % 25) / 10 + 0.4).toFixed(1)} KB/s`;
  const netOutVal = live ? `${(live.netOutRate / 1024).toFixed(1)} KB/s` : `${((s % 9)  / 10 + 0.1).toFixed(1)} KB/s`;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <Row label="Status" value={
          <span style={{ color: STATUS_COLOR[node.status] }}>● {node.status}</span>
        } />
        <Row label="Role"     value={TIER_LABEL[node.role]} />
        {node.location && <Row label="Location" value={node.location} />}
        <Row label="Uptime" value={`${days}d ${hours}h ${mins}m`} />
        <Row label="CPU"    value={cpuVal} />
        <Row label="RAM"    value={memVal} />
        <Row label="Disk"   value={`${((s % 18) + 8).toFixed(1)} GB / 32 GB`} />
        <Row label="Net ↓"  value={netInVal} />
        <Row label="Net ↑"  value={netOutVal} />
        <Row label="Ping"   value={`${(s % 8) + 2} ms`} />
        <Row label="ID"     value={<span style={{ color: '#64748b', fontSize: '0.65rem' }}>{node.id}</span>} />
      </tbody>
    </table>
  );
}

function GameScreen({ node }: { node: FleetNode }) {
  const s = seed(node.id);
  const score = (s * 137) % 99800;
  const lives = (s % 3) + 1;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000514', gap: 8 }}>
      <div style={{ fontSize: '0.6rem', color: '#475569', letterSpacing: '0.3em' }}>STATION ARCADE</div>
      <div style={{ fontSize: '2.2rem', color: '#facc15', fontWeight: 700, letterSpacing: '0.1em' }}>
        {score.toLocaleString().padStart(6, '0')}
      </div>
      <div style={{ fontSize: '0.62rem', color: '#4ade80', letterSpacing: '0.1em' }}>▶ GAME IN PROGRESS</div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i <= lives ? '#f87171' : '#1e293b', border: '1px solid #334155' }} />
        ))}
      </div>
      <div style={{ fontSize: '0.58rem', color: '#334155', letterSpacing: '0.1em' }}>LIVES</div>
    </div>
  );
}

function InfoScreen() {
  const events = [
    { time: '2:00 PM', title: 'Esports Open — Stage A', active: false },
    { time: '3:30 PM', title: 'Free Play — All Stations', active: true },
    { time: '5:00 PM', title: 'Tournament Finals', active: false },
    { time: '7:00 PM', title: 'Closing Ceremony', active: false },
  ];
  return (
    <div style={{ flex: 1, background: '#000814', padding: '20px 24px', overflow: 'auto' }}>
      <div style={{ fontSize: '0.58rem', color: '#7dd3fc', letterSpacing: '0.3em', marginBottom: 20 }}>TODAY'S SCHEDULE</div>
      {events.map((e, i) => (
        <div key={i} style={{ marginBottom: 14, borderLeft: `2px solid ${e.active ? '#4ade80' : '#1e293b'}`, paddingLeft: 12 }}>
          <div style={{ color: e.active ? '#4ade80' : '#475569', fontSize: '0.62rem', letterSpacing: '0.05em' }}>{e.time}</div>
          <div style={{ color: e.active ? '#f1f5f9' : '#64748b', fontSize: '0.76rem', marginTop: 2 }}>{e.title}</div>
        </div>
      ))}
    </div>
  );
}

function ControllerScreen({ node }: { node: FleetNode }) {
  const s = seed(node.id);
  const rows = [
    ['FLEET AGENT',   'running'],
    ['TAILSCALE',     'connected'],
    ['SYNC QUEUE',    '0 pending'],
    ['UPTIME',        `${s % 7}d ${(s * 3) % 24}h`],
    ['KIOSKS ONLINE', `${(s % 3) + 7} / 9`],
  ];
  return (
    <div style={{ flex: 1, background: '#000814', padding: '16px', overflow: 'auto', fontSize: '0.68rem' }}>
      <div style={{ color: '#475569', fontSize: '0.58rem', letterSpacing: '0.15em', marginBottom: 14 }}>SYSTEM STATUS</div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#475569' }}>{label}</span>
          <span style={{ color: '#4ade80' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function LiveScreen({ node, live }: { node: FleetNode; live: NodeStats }) {
  const isKiosk = node.role === 'game-kiosk' || node.role === 'info-kiosk';
  const bg = node.role === 'game-kiosk' ? '#000514' : '#000814';
  const uptimeSecs = live.uptime;
  const ud = Math.floor(uptimeSecs / 86400);
  const uh = Math.floor((uptimeSecs % 86400) / 3600);
  const um = Math.floor((uptimeSecs % 3600) / 60);

  return (
    <div style={{ flex: 1, background: bg, padding: '16px', overflow: 'auto', fontSize: '0.68rem' }}>
      {isKiosk && (
        <div style={{ textAlign: 'center', marginBottom: 16, color: '#1e293b', fontSize: '0.58rem', letterSpacing: '0.2em' }}>
          HEADLESS CONTAINER · NO DISPLAY OUTPUT
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ color: '#475569', fontSize: '0.58rem', letterSpacing: '0.12em' }}>UPTIME</span>
        <span style={{ color: '#4ade80' }}>{ud}d {uh}h {um}m</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ color: '#475569', fontSize: '0.58rem', letterSpacing: '0.12em' }}>CPU</span>
        <span style={{ color: live.cpu > 80 ? '#f87171' : '#4ade80' }}>{live.cpu.toFixed(1)}%</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <span style={{ color: '#475569', fontSize: '0.58rem', letterSpacing: '0.12em' }}>MEM</span>
        <span style={{ color: '#4ade80' }}>
          {(live.memUsed / (1024 * 1024)).toFixed(0)} / {(live.memTotal / (1024 * 1024)).toFixed(0)} MB
        </span>
      </div>
      <div style={{ color: '#475569', fontSize: '0.58rem', letterSpacing: '0.15em', marginBottom: 10 }}>PROCESSES</div>
      {live.processes.length === 0 ? (
        <div style={{ color: '#334155' }}>no process data yet</div>
      ) : live.processes.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 5 }}>
          <span style={{ color: '#334155', width: 40, flexShrink: 0, textAlign: 'right' }}>{p.pid}</span>
          <span style={{ color: '#64748b' }}>{p.cmd}</span>
        </div>
      ))}
    </div>
  );
}

function ScreenView({ node, live }: { node: FleetNode; live?: NodeStats }) {
  if (live) return <LiveScreen node={node} live={live} />;
  if (node.role === 'game-kiosk') return <GameScreen node={node} />;
  if (node.role === 'info-kiosk') return <InfoScreen />;
  return <ControllerScreen node={node} />;
}

type Tab = 'stats' | 'screen';

export default function StatsPanel({ node, isMock }: { node: FleetNode; isMock?: boolean }) {
  const [tab, setTab] = useState<Tab>('stats');
  const [liveStats, setLiveStats] = useState<NodeStats | undefined>();

  useEffect(() => {
    setLiveStats(undefined);
    if (isMock !== false) return;
    socket.emit('node:stats:subscribe', { nodeId: node.id });
    const onData = ({ nodeId, stats }: { nodeId: string; stats: NodeStats }) => {
      if (nodeId === node.id) setLiveStats(stats);
    };
    socket.on('node:stats:data', onData);
    return () => {
      socket.emit('node:stats:unsubscribe', { nodeId: node.id });
      socket.off('node:stats:data', onData);
    };
  }, [node.id, isMock]);

  return (
    <div style={{ background: '#020c1b', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ height: 34, background: '#0d1f35', borderBottom: '1px solid #1e293b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {(['stats', 'screen'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? '#4ade80' : 'transparent'}`,
              color: tab === t ? '#f1f5f9' : '#475569',
              padding: '0 14px',
              height: '100%',
              fontSize: '0.68rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
          >
            {t}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', paddingRight: 12, color: '#334155', fontSize: '0.62rem' }}>
          {node.name}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'stats'  && <StatsView  node={node} live={liveStats} />}
        {tab === 'screen' && <ScreenView node={node} live={liveStats} />}
      </div>
    </div>
  );
}
