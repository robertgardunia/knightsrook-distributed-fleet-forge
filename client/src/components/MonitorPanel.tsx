import { useEffect, useState } from 'react';
import { socket } from '../socket';
import type { FleetNode, NodeStats } from '../types/fleet';

function bar(pct: number, width = 18) {
  const filled = Math.round((pct / 100) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

function mockStats(nodeId: string): NodeStats {
  const seed = nodeId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const jitter = () => Math.random() * 8 - 4;
  return {
    cpu:       Math.min(95, Math.max(5, (seed % 40) + 20 + jitter())),
    memUsed:   ((seed % 300) + 380) * 1024 * 1024,
    memTotal:  1536 * 1024 * 1024,
    netInRate: (0.4 + Math.random() * 2.5) * 1024,
    netOutRate:(0.1 + Math.random() * 0.9) * 1024,
    uptime:    (seed % 7) * 86400 + (seed * 3 % 24) * 3600,
    processes: [
      { pid: String(1000 + (seed % 99)), cmd: 'node dist/index' },
      { pid: String(1100 + (seed % 99)), cmd: 'tailscaled' },
      { pid: String(1200 + (seed % 99)), cmd: 'netdata' },
      { pid: String(1300 + (seed % 99)), cmd: 'avahi-daemon' },
    ],
  };
}

function fmt(bytes: number) {
  if (bytes < 1024) return bytes.toFixed(0) + ' B/s';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB/s';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
}

function fmtMem(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
}

export default function MonitorPanel({ node, isMock }: { node: FleetNode; isMock?: boolean }) {
  const [stats, setStats] = useState<NodeStats>(() => mockStats(node.id));

  useEffect(() => {
    setStats(mockStats(node.id));
    if (isMock !== false) {
      const id = setInterval(() => setStats(mockStats(node.id)), 2000);
      return () => clearInterval(id);
    }
    // Online mode — subscribe to real stats
    socket.emit('node:stats:subscribe', { nodeId: node.id });
    const onData = ({ nodeId, stats: s }: { nodeId: string; stats: NodeStats }) => {
      if (nodeId === node.id) setStats(s);
    };
    socket.on('node:stats:data', onData);
    return () => {
      socket.emit('node:stats:unsubscribe', { nodeId: node.id });
      socket.off('node:stats:data', onData);
    };
  }, [node.id, isMock]);

  const memPct = Math.min(100, (stats.memUsed / stats.memTotal) * 100);

  return (
    <div style={{ background: '#020c1b', borderRight: '1px solid #1e293b', borderBottom: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ height: 34, background: '#162d47', borderBottom: '1px solid #1e293b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <span style={{
          borderBottom: '2px solid #4ade80',
          color: '#f1f5f9',
          padding: '0 14px',
          height: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: '0.68rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          Monitor
        </span>
        <span style={{ marginLeft: 'auto', paddingRight: 12, color: '#334155', fontSize: '0.62rem' }}>
          {node.name}
        </span>
      </div>
      <pre style={{ flex: 1, minHeight: 0, margin: 0, padding: '12px 14px', color: '#4ade80', fontSize: '0.7rem', fontFamily: '"Cascadia Code", "Fira Code", monospace', lineHeight: 1.7, overflow: 'hidden', whiteSpace: 'pre' }}>
{`  CPU  ${bar(stats.cpu)} ${stats.cpu.toFixed(0).padStart(2)}%
  MEM  ${bar(memPct)} ${memPct.toFixed(0).padStart(2)}%
  NET  ↓ ${fmt(stats.netInRate)}  ↑ ${fmt(stats.netOutRate)}

  ${'PID'.padEnd(6)} CMD
${stats.processes.map(p =>
  `  ${p.pid.padEnd(6)} ${p.cmd}`
).join('\n')}`}
      </pre>
    </div>
  );
}
