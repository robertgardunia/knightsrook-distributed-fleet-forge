import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';

interface LogEntry {
  id:      string;
  ts:      number;
  color:   string;
  icon:    string;
  label:   string;
  text:    string;
  detail?: string;
}

function fmtTs(t: number) {
  return new Date(t).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ActivityPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  function push(e: Omit<LogEntry, 'id' | 'ts'>) {
    setEntries(prev => [...prev, { ...e, id: Math.random().toString(36).slice(2), ts: Date.now() }].slice(-300));
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  useEffect(() => {
    function onChaos(d: { tool: string; target: string; reason: string }) {
      push({ color: '#fca5a5', icon: '⚡', label: 'chaos', text: `${d.tool.replace(/_/g, ' ')} → ${d.target}`, detail: d.reason });
    }
    function onSpawned(d: { nodeId: string; faultType?: string }) {
      push({ color: '#93c5fd', icon: '🔥', label: 'fireman', text: `spawned → ${d.nodeId}`, detail: d.faultType });
    }
    function onResolved(d: { nodeId: string }) {
      push({ color: '#86efac', icon: '✓', label: 'fireman', text: `${d.nodeId} recovered` });
    }
    function onEscalated(d: { nodeId: string; reason?: string }) {
      push({ color: '#fbbf24', icon: '⚠', label: 'fireman', text: `escalation: ${d.nodeId}`, detail: (d as {reason?: string}).reason });
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
    <div style={{
      width: 260,
      height: '100%',
      flexShrink: 0,
      background: '#020c1b',
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'monospace',
      fontSize: '0.68rem',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#64748b', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Activity
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 8px' }}>
        {entries.length === 0 ? (
          <div style={{ color: '#1e293b', fontSize: '0.62rem', padding: '8px 4px', fontStyle: 'italic' }}>
            no activity yet
          </div>
        ) : entries.map(e => (
          <div key={e.id} style={{ marginBottom: 8, borderLeft: `2px solid ${e.color}44`, paddingLeft: 7 }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ color: '#1e3a5f', fontSize: '0.58rem', flexShrink: 0 }}>{fmtTs(e.ts)}</span>
              <span style={{ color: '#334155', fontSize: '0.58rem', flexShrink: 0 }}>[{e.label}]</span>
              <span style={{ color: e.color, fontSize: '0.62rem', wordBreak: 'break-all' }}>{e.icon} {e.text}</span>
            </div>
            {e.detail && (
              <div style={{ color: '#334155', fontSize: '0.57rem', paddingLeft: 4, marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word' }}>
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
