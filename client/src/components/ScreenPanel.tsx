import type { FleetNode } from '../types/fleet';

function seed(id: string) {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function GameScreen({ node }: { node: FleetNode }) {
  const s = seed(node.id);
  const score = (s * 137) % 99800;
  const lives = (s % 3) + 1;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000514', gap: 8 }}>
      <div style={{ fontSize: '0.6rem', color: '#475569', letterSpacing: '0.3em' }}>STATION ARCADE</div>
      <div style={{ fontSize: '2.2rem', color: '#facc15', fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'monospace' }}>
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
          <div style={{ color: e.active ? '#f1f5f9' : '#64748b', fontSize: '0.76rem', marginTop: 2, fontFamily: 'monospace' }}>{e.title}</div>
        </div>
      ))}
    </div>
  );
}

function TerminalScreen({ node }: { node: FleetNode }) {
  const s = seed(node.id);
  const lines = [
    { text: `root@${node.id}:~# systemctl status fleet-agent`, color: '#facc15' },
    { text: `● fleet-agent.service`, color: '#4ade80' },
    { text: `   Active: active (running)`, color: '#94a3b8' },
    { text: `   PID: ${1000 + (s % 99)}  Tasks: ${(s % 8) + 4}`, color: '#94a3b8' },
    { text: '', color: '' },
    { text: `root@${node.id}:~# tail -f /var/log/fleet/sync.log`, color: '#facc15' },
    { text: `[INFO] heartbeat ok — 0 events pending`, color: '#7dd3fc' },
    { text: `[INFO] peer ${s % 5 === 0 ? 'reconnected' : 'heartbeat ok'}`, color: '#7dd3fc' },
    { text: `[INFO] sync ok — uptime ${(s % 72) + 1}h`, color: '#7dd3fc' },
    { text: `█`, color: '#4ade80' },
  ];
  return (
    <div style={{ flex: 1, background: '#020c1b', padding: '14px 16px', overflow: 'auto', fontFamily: '"Cascadia Code", "Fira Code", monospace', fontSize: '0.68rem', lineHeight: 1.7 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.color || 'transparent' }}>{l.text || ' '}</div>
      ))}
    </div>
  );
}

export default function ScreenPanel({ node }: { node: FleetNode }) {
  return (
    <div style={{ background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid #0f172a', background: '#020c1b', flexShrink: 0 }}>
        <span style={{ color: '#475569', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Screen · {node.name}
        </span>
      </div>
      {node.role === 'game-kiosk'  && <GameScreen node={node} />}
      {node.role === 'info-kiosk'  && <InfoScreen />}
      {(node.role === 'homebase' || node.role === 'station-controller') && <TerminalScreen node={node} />}
    </div>
  );
}
