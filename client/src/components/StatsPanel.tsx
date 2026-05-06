import { useEffect, useRef, useState } from 'react';
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

// Derive the host-published port from node ID.
// s{N}-game-{K} → 18N0K  (s1-game-1 → 18101)
// s{N}-info-{K} → 18N5K  (s1-info-1 → 18151)
function kioskPort(nodeId: string): number | null {
  const m = nodeId.match(/^s(\d+)-(game|info)-(\d+)$/);
  if (!m) return null;
  const station = parseInt(m[1]);
  const isInfo  = m[2] === 'info';
  const num     = parseInt(m[3]);
  return 18000 + station * 100 + (isInfo ? 50 : 0) + num;
}

function LiveKioskScreen({ node, muted, onToggleMute }: { node: FleetNode; muted: boolean; onToggleMute: () => void }) {
  const port = kioskPort(node.id);
  if (!port) return null;
  const muteParam = muted ? '&muted=1' : '';
  const src = `http://localhost:${port}/index.html?attract=1${muteParam}`;
  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
      <iframe
        key={muted ? 'muted' : 'live'}
        src={src}
        style={{ border: 'none', width: '100%', height: '100%', display: 'block', background: '#000' }}
        title={node.id}
        allow="autoplay"
      />
      <button
        onClick={onToggleMute}
        style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(2,12,27,0.8)', border: `1px solid ${muted ? '#334155' : '#4ade80'}`,
          color: muted ? '#475569' : '#4ade80',
          borderRadius: 3, padding: '3px 9px',
          fontSize: '0.6rem', letterSpacing: '0.12em',
          textTransform: 'uppercase', cursor: 'pointer',
        }}
      >
        {muted ? 'muted' : 'audio on'}
      </button>
    </div>
  );
}

const HEXGL_SCREENS = [
  '/games/hexgl-title.png',
  '/games/hexgl-gameover.jpg',
  '/games/hexgl-race1.png',
  '/games/hexgl-race2.png',
  '/games/hexgl-race3.png',
];

function GameScreen({ node }: { node: FleetNode }) {
  const src = HEXGL_SCREENS[seed(node.id) % HEXGL_SCREENS.length];
  return (
    <div style={{ flex: 1, overflow: 'hidden', background: '#000514' }}>
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.92 }} />
    </div>
  );
}

const INFO_SLIDES = [
  '/games/info-build-racer.png',
  '/games/info-controls.png',
  '/games/info-cornering.png',
  '/games/info-scan-qr.png',
];

function InfoScreen({ node }: { node: FleetNode }) {
  const initial = seed(node.id) % INFO_SLIDES.length;
  const [idx, setIdx] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const schedule = () => {
      const delay = 8000 + Math.random() * 7000;
      timerRef.current = setTimeout(() => {
        setIdx(i => (i + 1) % INFO_SLIDES.length);
        schedule();
      }, delay);
    };
    schedule();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div style={{ flex: 1, overflow: 'hidden', background: '#000814', position: 'relative' }}>
      <img
        key={idx}
        src={INFO_SLIDES[idx]}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <div style={{ position: 'absolute', bottom: 6, right: 8, display: 'flex', gap: 4 }}>
        {INFO_SLIDES.map((_, i) => (
          <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === idx ? '#4ade80' : '#1e293b' }} />
        ))}
      </div>
    </div>
  );
}

function NoGuiScreen() {
  return (
    <div style={{ flex: 1, background: '#000814', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#1e3a5f', fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
        No display output — headless node
      </span>
    </div>
  );
}

function LiveScreen({ node, live }: { node: FleetNode; live: NodeStats }) {
  const bg = node.role === 'game-kiosk' ? '#000514' : '#000814';
  const uptimeSecs = live.uptime;
  const ud = Math.floor(uptimeSecs / 86400);
  const uh = Math.floor((uptimeSecs % 86400) / 3600);
  const um = Math.floor((uptimeSecs % 3600) / 60);

  return (
    <div style={{ flex: 1, background: bg, padding: '16px', overflow: 'auto', fontSize: '0.68rem' }}>
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

function ScreenView({ node, isMock, muted, onToggleMute }: { node: FleetNode; isMock?: boolean; muted: boolean; onToggleMute: () => void }) {
  if (node.role === 'game-kiosk') return isMock ? <GameScreen node={node} /> : <LiveKioskScreen node={node} muted={muted} onToggleMute={onToggleMute} />;
  if (node.role === 'info-kiosk') return isMock ? <InfoScreen node={node} /> : <LiveKioskScreen node={node} muted={muted} onToggleMute={onToggleMute} />;
  return <NoGuiScreen />;
}

type Tab = 'stats' | 'screen';

export default function StatsPanel({ node, isMock }: { node: FleetNode; isMock?: boolean }) {
  const [tab, setTab] = useState<Tab>('stats');
  const [liveStats, setLiveStats] = useState<NodeStats | undefined>();
  const [muted, setMuted] = useState(true);

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
      <div style={{ height: 34, background: '#162d47', borderBottom: '1px solid #1e293b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
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
        {tab === 'screen' && <ScreenView node={node} isMock={isMock} muted={muted} onToggleMute={() => setMuted(m => !m)} />}
      </div>
    </div>
  );
}
