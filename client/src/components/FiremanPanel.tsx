import { useEffect, useState } from 'react';
import { socket } from '../socket';

interface FiremanEvent {
  id:         string;
  incidentId: string;
  nodeId:     string;
  type:       'spawned' | 'action' | 'resolved' | 'escalated';
  text:       string;
  ts:         number;
}

interface Incident {
  id:      string;
  nodeId:  string;
  events:  FiremanEvent[];
  outcome?: 'resolved' | 'escalated';
}

export default function FiremanPanel() {
  const [events,    setEvents]    = useState<FiremanEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [acked,     setAcked]     = useState<Set<string>>(new Set());

  useEffect(() => {
    function push(type: FiremanEvent['type'], data: Record<string, unknown>) {
      const ev: FiremanEvent = {
        id:         `${data.incidentId}-${type}-${Date.now()}`,
        incidentId: data.incidentId as string,
        nodeId:     data.nodeId     as string,
        type,
        text: type === 'spawned'
          ? `${data.faultType ?? data.event ?? '?'} · ${data.model ?? ''}`
          : type === 'action'
          ? `${data.action}: "${data.reason}"`
          : type === 'resolved'
          ? `resolved in ${Math.round((data.durationMs as number) / 1000)}s`
          : `${data.summary}`,
        ts: Date.now(),
      };
      setEvents(prev => [ev, ...prev].slice(0, 150));
    }

    const onSpawned   = (d: Record<string, unknown>) => push('spawned',   d);
    const onAction    = (d: Record<string, unknown>) => push('action',    d);
    const onResolved  = (d: Record<string, unknown>) => push('resolved',  d);
    const onEscalated = (d: Record<string, unknown>) => push('escalated', d);

    socket.on('fireman:spawned',   onSpawned);
    socket.on('fireman:action',    onAction);
    socket.on('fireman:resolved',  onResolved);
    socket.on('fireman:escalated', onEscalated);
    return () => {
      socket.off('fireman:spawned',   onSpawned);
      socket.off('fireman:action',    onAction);
      socket.off('fireman:resolved',  onResolved);
      socket.off('fireman:escalated', onEscalated);
    };
  }, []);

  // Group events into incidents (most-recently-seen first)
  const incidents: Incident[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (seen.has(ev.incidentId)) continue;
    seen.add(ev.incidentId);
    const group   = events.filter(e => e.incidentId === ev.incidentId);
    const outcome = group.find(e => e.type === 'resolved')  ? 'resolved' as const
                  : group.find(e => e.type === 'escalated') ? 'escalated' as const
                  : undefined;
    incidents.push({ id: ev.incidentId, nodeId: ev.nodeId, events: group, outcome });
  }

  const unacked  = incidents.filter(i => i.outcome === 'escalated' && !acked.has(i.id));
  const hasAlert = unacked.length > 0;

  if (incidents.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, width: 360, zIndex: 200,
      background: '#0f172a', border: `1px solid ${hasAlert ? '#f87171' : '#1e293b'}`,
      borderRadius: 6, fontFamily: 'monospace', fontSize: '0.72rem',
      boxShadow: hasAlert ? '0 0 14px rgba(248,113,113,0.35)' : '0 2px 8px rgba(0,0,0,0.4)',
    }}>

      {/* Header */}
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
          Fireman{hasAlert
            ? ` ⚠ ${unacked.length} escalation${unacked.length > 1 ? 's' : ''}`
            : ` (${incidents.length})`}
        </span>
        <span style={{ opacity: 0.5 }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {/* Incident list */}
      {!collapsed && (
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {incidents.slice(0, 20).map(inc => {
            const spawned   = inc.events.find(e => e.type === 'spawned');
            const actions   = inc.events.filter(e => e.type === 'action');
            const outcome   = inc.events.find(e => e.type === 'resolved' || e.type === 'escalated');
            const isActive   = !inc.outcome;
            const isResolved = inc.outcome === 'resolved';
            const isEscalated = inc.outcome === 'escalated';
            const isUnacked  = isEscalated && !acked.has(inc.id);

            const accent = isResolved ? '#4ade80' : isEscalated ? '#f87171' : '#60a5fa';

            return (
              <div key={inc.id} style={{
                background: '#070f1e',
                borderRadius: 3,
                borderLeft: `3px solid ${accent}`,
                padding: '5px 8px',
              }}>
                {/* Incident header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                  <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.7rem' }}>
                    <span style={{ color: accent, marginRight: 5 }}>
                      {isResolved ? '✓' : isEscalated ? '⚠' : '●'}
                    </span>
                    {inc.nodeId}
                  </div>
                  {spawned && (
                    <div style={{ color: '#475569', fontSize: '0.6rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {spawned.text}
                    </div>
                  )}
                </div>

                {/* Action lines */}
                {actions.map((a, i) => (
                  <div key={i} style={{
                    color: '#64748b', fontSize: '0.64rem',
                    paddingLeft: 10, lineHeight: 1.55,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {a.text}
                  </div>
                ))}

                {/* Outcome line */}
                {outcome && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: 3, color: accent, fontSize: '0.64rem',
                  }}>
                    <span>{outcome.text}</span>
                    {isUnacked && (
                      <button
                        onClick={e => { e.stopPropagation(); setAcked(prev => new Set([...prev, inc.id])); }}
                        style={{
                          background: 'transparent', border: '1px solid #f8717166',
                          color: '#f87171', cursor: 'pointer',
                          fontSize: '0.58rem', padding: '1px 7px', borderRadius: 2, letterSpacing: '0.06em',
                        }}
                      >
                        ACK
                      </button>
                    )}
                  </div>
                )}

                {/* In-progress indicator */}
                {isActive && (
                  <div style={{ color: '#3b82f6', fontSize: '0.6rem', marginTop: 2, opacity: 0.7 }}>
                    working…
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
