import { useEffect, useState } from 'react';
import type { FleetNode } from '../types/fleet';

function bar(pct: number, width = 18) {
  const filled = Math.round((pct / 100) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

interface Stats {
  cpu: number;
  mem: number;
  netIn: number;
  netOut: number;
  processes: { pid: number; cpu: number; mem: number; cmd: string }[];
}

function mockStats(nodeId: string): Stats {
  const seed = nodeId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const jitter = () => Math.random() * 8 - 4;
  return {
    cpu: Math.min(95, Math.max(5, (seed % 40) + 20 + jitter())),
    mem: Math.min(90, Math.max(10, (seed % 30) + 25 + jitter() * 0.5)),
    netIn: 0.4 + Math.random() * 2.5,
    netOut: 0.1 + Math.random() * 0.9,
    processes: [
      { pid: 1000 + (seed % 99), cpu: +(Math.random() * 0.4).toFixed(1), mem: 1.1, cmd: 'node dist/index' },
      { pid: 1100 + (seed % 99), cpu: +(Math.random() * 0.2).toFixed(1), mem: 0.8, cmd: 'tailscaled' },
      { pid: 1200 + (seed % 99), cpu: 0.0, mem: 0.5, cmd: 'netdata' },
      { pid: 1300 + (seed % 99), cpu: 0.0, mem: 0.3, cmd: 'avahi-daemon' },
    ],
  };
}

export default function MonitorPanel({ node }: { node: FleetNode }) {
  const [stats, setStats] = useState<Stats>(() => mockStats(node.id));

  useEffect(() => {
    setStats(mockStats(node.id));
    const id = setInterval(() => setStats(mockStats(node.id)), 2000);
    return () => clearInterval(id);
  }, [node.id]);

  return (
    <div style={{ background: '#020c1b', borderRight: '1px solid #1e293b', borderBottom: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: '#475569', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', flex: 1 }}>
          Monitor · {node.name}
        </span>
        <button
          title="SSH not wired yet"
          style={{ background: '#0c2340', border: '1px solid #1e4a6e', color: '#7dd3fc', padding: '2px 10px', fontSize: '0.68rem', cursor: 'not-allowed', borderRadius: 2, letterSpacing: '0.08em', opacity: 0.7 }}
        >
          SSH ↗
        </button>
      </div>
      <pre style={{ flex: 1, margin: 0, padding: '12px 14px', color: '#4ade80', fontSize: '0.7rem', fontFamily: '"Cascadia Code", "Fira Code", monospace', lineHeight: 1.7, overflow: 'auto', whiteSpace: 'pre' }}>
{`  CPU  ${bar(stats.cpu)} ${stats.cpu.toFixed(0).padStart(2)}%
  MEM  ${bar(stats.mem)} ${stats.mem.toFixed(0).padStart(2)}%
  NET  ↓ ${stats.netIn.toFixed(1)} KB/s  ↑ ${stats.netOut.toFixed(1)} KB/s

  ${'PID'.padEnd(6)} ${'CPU%'.padStart(5)} ${'MEM%'.padStart(5)}  CMD
${stats.processes.map(p =>
  `  ${String(p.pid).padEnd(6)} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)}  ${p.cmd}`
).join('\n')}`}
      </pre>
    </div>
  );
}
