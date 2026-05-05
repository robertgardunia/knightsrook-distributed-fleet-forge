import { useEffect, useState } from 'react';
import { socket } from '../socket';

interface FiremanEvent {
  id:         string;
  incidentId: string;
  nodeId:     string;
  type:       'spawned' | 'action' | 'resolved' | 'escalated';
  text:       string;
  severity?:  string;
  ts:         number;
}

export default function FiremanPanel() {
  const [events,    setEvents]    = useState<FiremanEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    function push(type: FiremanEvent['type'], data: Record<string, unknown>) {
      const ev: FiremanEvent = {
        id:         `${data.incidentId}-${type}-${Date.now()}`,
        incidentId: data.incidentId as string,
        nodeId:     data.nodeId     as string,
        type,
        severity:   data.severity  as string | undefined,
        text:       type === 'spawned'   ? `▶ ${data.nodeId} — ${data.faultType ?? data.event} (${data.model})`
                  : type === 'action'    ? `  ${data.action}: "${data.reason}"`
                  : type === 'resolved'  ? `✓ ${data.nodeId} resolved in ${Math.round((data.durationMs as number) / 1000)}s`
                  : /* escalated */        `⚠ ${data.nodeId}: ${data.summary}`,
        ts: Date.now(),
      };
      setEvents(prev => [ev, ...prev].slice(0, 50));
    }

    socket.on('fireman:spawned',   (d) => push('spawned',   d));
    socket.on('fireman:action',    (d) => push('action',    d));
    socket.on('fireman:resolved',  (d) => push('resolved',  d));
    socket.on('fireman:escalated', (d) => push('escalated', d));

    return () => {
      socket.off('fireman:spawned');
      socket.off('fireman:action');
      socket.off('fireman:resolved');
      socket.off('fireman:escalated');
    };
  }, []);

  const escalations = events.filter(e => e.type === 'escalated');
  const hasAlert    = escalations.length > 0;

  if (events.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, width: 340, zIndex: 200,
      background: '#0f172a', border: `1px solid ${hasAlert ? '#f87171' : '#1e293b'}`,
      borderRadius: 6, fontFamily: 'monospace', fontSize: '0.72rem',
      boxShadow: hasAlert ? '0 0 12px rgba(248,113,113,0.3)' : '0 2px 8px rgba(0,0,0,0.4)',
    }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid #1e293b',
          color: hasAlert ? '#f87171' : '#94a3b8',
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem' }}>
          Fireman {hasAlert ? `⚠ ${escalations.length} escalation${escalations.length > 1 ? 's' : ''}` : `(${events.length})`}
        </span>
        <span style={{ opacity: 0.5 }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
          {events.map(ev => (
            <div key={ev.id} style={{
              padding: '3px 10px',
              color: ev.type === 'escalated' ? '#f87171'
                   : ev.type === 'resolved'  ? '#4ade80'
                   : ev.type === 'spawned'   ? '#60a5fa'
                   : '#94a3b8',
              borderLeft: ev.type === 'escalated' ? '2px solid #f87171'
                        : ev.type === 'resolved'   ? '2px solid #4ade80'
                        : '2px solid transparent',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {ev.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
