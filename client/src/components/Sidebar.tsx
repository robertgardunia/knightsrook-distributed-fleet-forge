import { useEffect, useState } from 'react';
import type { FleetGraph, NodeStatus } from '../types/fleet';

const STATUS_COLOR: Record<NodeStatus, string> = {
  federation: '#4ade80',
  island:     '#facc15',
  swarm:      '#fb923c',
  dead:       '#f87171',
};

interface PatternEntry {
  faultSig:      string;
  bestResponse:  string;
  successCount:  number;
  failureCount:  number;
  avgDurationMs: number;
}

function Divider() {
  return <div style={{ borderTop: '1px solid #1e293b', margin: '10px 0' }} />;
}

interface Props {
  graph:        FleetGraph;
  labConnected: boolean;
  apiBase:      string;
}

export default function Sidebar({ graph, labConnected, apiBase }: Props) {
  const [patterns, setPatterns] = useState<PatternEntry[]>([]);

  const stations = graph.nodes.filter(n => n.role === 'station-controller');
  const kiosks   = graph.nodes.filter(n => n.role === 'game-kiosk' || n.role === 'info-kiosk');
  const counts   = (['federation', 'island', 'swarm', 'dead'] as NodeStatus[]).map(s => ({
    status: s,
    count: graph.nodes.filter(n => n.status === s).length,
  }));

  useEffect(() => {
    if (!labConnected) { setPatterns([]); return; }
    let cancelled = false;
    function poll() {
      fetch(`${apiBase}/api/playbook/patterns`)
        .then(r => r.json())
        .then((d: PatternEntry[]) => { if (!cancelled) setPatterns(d); })
        .catch(() => {});
    }
    poll();
    const t = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [labConnected, apiBase]);

  return (
    <div style={{
      width: 240,
      height: '100%',
      flexShrink: 0,
      background: '#020c1b',
      borderLeft: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontSize: '0.7rem',
      color: '#94a3b8',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#64748b', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Fleet Status
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '12px 12px 0' }}>
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

          <div style={{ color: '#475569', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            Playbook {patterns.length > 0 ? `· ${patterns.length}` : ''}
          </div>
        </div>

        {patterns.length === 0 ? (
          <div style={{ color: '#1e293b', fontSize: '0.62rem', padding: '0 12px 8px', fontStyle: 'italic' }}>
            {labConnected ? 'no patterns yet' : 'offline demo'}
          </div>
        ) : (
          <div style={{ padding: '0 0 8px' }}>
            {patterns.map(p => {
              const total = p.successCount + p.failureCount;
              const pct   = total > 0 ? Math.round((p.successCount / total) * 100) : 0;
              const bar   = pct >= 80 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';
              return (
                <div key={p.faultSig} style={{ padding: '5px 12px', borderLeft: `3px solid ${bar}44`, marginBottom: 1 }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.62rem', marginBottom: 2, wordBreak: 'break-all' }}>
                    {p.faultSig}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ color: '#334155', fontSize: '0.58rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.bestResponse}
                    </span>
                    <span style={{ color: bar, fontSize: '0.6rem', flexShrink: 0 }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ color: '#1e3a5f', fontSize: '0.57rem', marginTop: 1 }}>
                    {p.successCount}/{total} · {Math.round(p.avgDurationMs / 1000)}s avg
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
