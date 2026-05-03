import { useState } from 'react';
import type { FleetNode } from '../types/fleet';

function seed(id: string) {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function LogsView({ node }: { node: FleetNode }) {
  const s = seed(node.id);
  const lines = [
    { text: `root@${node.id}:~# systemctl status fleet-agent`, color: '#facc15' },
    { text: `● fleet-agent.service`, color: '#4ade80' },
    { text: `   Active: active (running)`, color: '#94a3b8' },
    { text: `   PID: ${1000 + (s % 99)}  Tasks: ${(s % 8) + 4}`, color: '#94a3b8' },
    { text: '', color: '' },
    { text: `root@${node.id}:~# journalctl -u fleet-agent -f`, color: '#facc15' },
    { text: `May 02 ${String((s % 12) + 10).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String((s * 3) % 60).padStart(2, '0')} ${node.id} fleet-agent[${1000 + (s % 99)}]: heartbeat ok — 0 events pending`, color: '#7dd3fc' },
    { text: `May 02 ${String((s % 12) + 10).padStart(2, '0')}:${String((s + 2) % 60).padStart(2, '0')}:${String((s * 5) % 60).padStart(2, '0')} ${node.id} fleet-agent[${1000 + (s % 99)}]: peer ${s % 5 === 0 ? 'reconnected' : 'heartbeat ok'}`, color: '#7dd3fc' },
    { text: `May 02 ${String((s % 12) + 10).padStart(2, '0')}:${String((s + 4) % 60).padStart(2, '0')}:${String((s * 7) % 60).padStart(2, '0')} ${node.id} fleet-agent[${1000 + (s % 99)}]: sync ok — uptime ${(s % 72) + 1}h`, color: '#7dd3fc' },
    { text: `█`, color: '#4ade80' },
  ];
  return (
    <div style={{ flex: 1, background: '#020c1b', padding: '14px 16px', overflow: 'auto', fontFamily: '"Cascadia Code", "Fira Code", monospace', fontSize: '0.68rem', lineHeight: 1.7 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.color || 'transparent' }}>{l.text || ' '}</div>
      ))}
    </div>
  );
}

function ShellView({ node }: { node: FleetNode }) {
  const s = seed(node.id);
  const history = [
    { cmd: `ssh root@${node.id}`, out: null, color: '#facc15' },
    { cmd: null, out: `Last login: Thu May  2 ${String((s % 12) + 8).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} from 100.64.${s % 255}.${(s * 3) % 255}`, color: '#64748b' },
    { cmd: null, out: '', color: '' },
    { cmd: `uptime`, out: ` ${String((s % 12) + 10).padStart(2, '0')}:${String((s * 3) % 60).padStart(2, '0')}:${String((s * 7) % 60).padStart(2, '0')} up ${s % 7} days, ${(s * 3) % 24}:${String((s * 11) % 60).padStart(2, '0')},  1 user,  load average: ${(s % 30 / 100 + 0.02).toFixed(2)}, ${(s % 25 / 100 + 0.01).toFixed(2)}, ${(s % 20 / 100 + 0.01).toFixed(2)}`, color: '#94a3b8' },
    { cmd: `df -h /`, out: `Filesystem      Size  Used Avail Use% Mounted on\n/dev/mmcblk0p2   30G  ${((s % 18) + 8).toFixed(1)}G   ${(22 - (s % 18)).toFixed(1)}G  ${Math.round(((s % 18) + 8) / 30 * 100)}% /`, color: '#94a3b8' },
    { cmd: `ps aux | grep fleet`, out: `root     ${1000 + (s % 99)}  ${(s % 40 + 18) / 100 + 0.1 | 0}.${(s % 9) + 1}  0.${(s % 5) + 1} fleet-agent --config /etc/fleet/agent.toml`, color: '#94a3b8' },
  ];

  return (
    <div style={{ flex: 1, background: '#020c1b', padding: '14px 16px', overflow: 'auto', fontFamily: '"Cascadia Code", "Fira Code", monospace', fontSize: '0.68rem', lineHeight: 1.7 }}>
      {history.map((item, i) => (
        <div key={i}>
          {item.cmd && (
            <div style={{ color: item.color }}>
              <span style={{ color: '#4ade80' }}>root@{node.id}</span>
              <span style={{ color: '#7dd3fc' }}>:~#</span>
              <span style={{ color: '#f1f5f9' }}> {item.cmd}</span>
            </div>
          )}
          {item.out !== null && item.out !== '' && item.out.split('\n').map((line, j) => (
            <div key={j} style={{ color: item.color || 'transparent' }}>{line}</div>
          ))}
          {item.out === '' && <div style={{ color: 'transparent' }}> </div>}
        </div>
      ))}
      <div>
        <span style={{ color: '#4ade80' }}>root@{node.id}</span>
        <span style={{ color: '#7dd3fc' }}>:~#</span>
        <span style={{ color: '#4ade80' }}> █</span>
      </div>
    </div>
  );
}

type Tab = 'logs' | 'shell';

export default function ScreenPanel({ node }: { node: FleetNode }) {
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <div style={{ background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ background: '#020c1b', borderBottom: '1px solid #0f172a', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {(['logs', 'shell'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? '#4ade80' : 'transparent'}`,
              color: tab === t ? '#f1f5f9' : '#475569',
              padding: '7px 14px',
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
        <span style={{ marginLeft: 'auto', paddingRight: 12, color: '#334155', fontSize: '0.62rem', fontFamily: 'monospace' }}>
          {node.name}
        </span>
      </div>

      {tab === 'logs' && <LogsView node={node} />}
      {tab === 'shell' && <ShellView node={node} />}
    </div>
  );
}
