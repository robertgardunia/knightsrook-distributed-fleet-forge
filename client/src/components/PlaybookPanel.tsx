import { useEffect, useState } from 'react';

interface PatternEntry {
  faultSig:      string;
  bestResponse:  string;
  successCount:  number;
  failureCount:  number;
  avgDurationMs: number;
}

interface Props {
  apiBase: string;
}

export default function PlaybookPanel({ apiBase }: Props) {
  const [patterns,  setPatterns]  = useState<PatternEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function fetch_() {
      fetch(`${apiBase}/api/playbook/patterns`)
        .then(r => r.json())
        .then((d: PatternEntry[]) => { if (!cancelled) setPatterns(d); })
        .catch(() => {});
    }
    fetch_();
    const t = setInterval(fetch_, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [apiBase]);

  if (patterns.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, width: 300, zIndex: 200,
      background: '#0f172a', border: '1px solid #1e293b',
      borderRadius: 6, fontFamily: 'monospace', fontSize: '0.72rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid #1e293b',
          color: '#94a3b8',
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem' }}>
          Playbook ({patterns.length} pattern{patterns.length !== 1 ? 's' : ''})
        </span>
        <span style={{ opacity: 0.5 }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
          {patterns.map(p => {
            const total = p.successCount + p.failureCount;
            const pct   = total > 0 ? Math.round((p.successCount / total) * 100) : 0;
            const bar   = pct >= 80 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';
            return (
              <div key={p.faultSig} style={{
                padding: '5px 10px',
                borderLeft: `3px solid ${bar}`,
                marginBottom: 1,
              }}>
                <div style={{ color: '#e2e8f0', fontSize: '0.68rem', marginBottom: 2 }}>
                  {p.faultSig}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '0.62rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                    {p.bestResponse}
                  </span>
                  <span style={{ color: bar, fontSize: '0.62rem', flexShrink: 0, marginLeft: 6 }}>
                    {pct}% · {p.successCount}/{total} · {Math.round(p.avgDurationMs / 1000)}s
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
