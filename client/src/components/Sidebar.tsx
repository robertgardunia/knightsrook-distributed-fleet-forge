import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import type { FleetGraph, NodeStatus } from '../types/fleet';

const STATUS_COLOR: Record<NodeStatus, string> = {
  federation: '#4ade80',
  island:     '#facc15',
  swarm:      '#fb923c',
  dead:       '#f87171',
};

function Divider() {
  return <div style={{ borderTop: '1px solid #1e293b', margin: '10px 0' }} />;
}

// ── Activity log ────────────────────────────────────────────────────────────

interface LogEntry {
  id:      string;
  ts:      number;
  color:   string;
  icon:    string;
  text:    string;
  detail?: string;
}

function fmtTs(t: number) {
  return new Date(t).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  function push(e: Omit<LogEntry, 'id' | 'ts'>) {
    setEntries(prev => [...prev, { ...e, id: Math.random().toString(36).slice(2), ts: Date.now() }].slice(-200));
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  useEffect(() => {
    function onChaos(d: { tool: string; target: string; reason: string }) {
      push({ color: '#fca5a5', icon: '⚡', text: `${d.tool.replace(/_/g, ' ')} → ${d.target}`, detail: d.reason });
    }
    function onSpawned(d: { nodeId: string; faultType?: string }) {
      push({ color: '#93c5fd', icon: '🔥', text: `fireman → ${d.nodeId}`, detail: d.faultType });
    }
    function onResolved(d: { nodeId: string }) {
      push({ color: '#86efac', icon: '✓', text: `${d.nodeId} recovered` });
    }
    function onEscalated(d: { nodeId: string }) {
      push({ color: '#fbbf24', icon: '⚠', text: `escalation: ${d.nodeId}` });
    }

    socket.on('chaos:action',      onChaos);
    socket.on('fireman:spawned',   onSpawned);
    socket.on('fireman:resolved',  onResolved);
    socket.on('fireman:escalated', onEscalated);
    return () => {
      socket.off('chaos:action',      onChaos);
      socket.off('fireman:spawned',   onSpawned);
      socket.off('fireman:resolved',  onResolved);
      socket.off('fireman:escalated', onEscalated);
    };
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '6px 14px 4px', color: '#334155', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>
        Activity
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 8px' }}>
        {entries.length === 0 ? (
          <div style={{ color: '#1e293b', fontSize: '0.62rem', padding: '8px 4px', fontStyle: 'italic' }}>
            no activity yet
          </div>
        ) : entries.map(e => (
          <div key={e.id} style={{ marginBottom: 7, borderLeft: `2px solid ${e.color}33`, paddingLeft: 7 }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
              <span style={{ color: '#1e3a5f', fontSize: '0.58rem', fontFamily: 'monospace', flexShrink: 0 }}>{fmtTs(e.ts)}</span>
              <span style={{ color: e.color, fontSize: '0.62rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {e.icon} {e.text}
              </span>
            </div>
            {e.detail && (
              <div style={{ color: '#334155', fontSize: '0.58rem', fontFamily: 'monospace', paddingLeft: 54, marginTop: 1, lineHeight: 1.4, wordBreak: 'break-word' }}>
                {e.detail}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

interface Props {
  graph: FleetGraph;
}

export default function Sidebar({ graph }: Props) {
  const stations = graph.nodes.filter(n => n.role === 'station-controller');
  const kiosks   = graph.nodes.filter(n => n.role === 'game-kiosk' || n.role === 'info-kiosk');
  const counts   = (['federation', 'island', 'swarm', 'dead'] as NodeStatus[]).map(s => ({
    status: s,
    count: graph.nodes.filter(n => n.status === s).length,
  }));

  return (
    <div style={{
      width: 280,
      height: '100%',
      background: '#020c1b',
      borderLeft: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontSize: '0.7rem',
      color: '#94a3b8',
    }}>
      <div style={{ padding: '7px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#64748b', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Fleet Status
        </span>
      </div>

      <div style={{ padding: '12px 14px 0', flexShrink: 0 }}>
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
      </div>

      <ActivityLog />
    </div>
  );
}
