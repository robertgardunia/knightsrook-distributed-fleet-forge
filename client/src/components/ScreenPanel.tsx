import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { socket } from '../socket';
import type { FleetNode } from '../types/fleet';

// ── Log line parsing ──────────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogLine {
  raw: string;
  ts: string;
  level: LogLevel;
  msg: string;
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  error: '#f87171',
  warn:  '#facc15',
  info:  '#cbd5e1',
  debug: '#475569',
};

function detectLevel(text: string): LogLevel {
  const t = text.toLowerCase();
  if (/error|fail|dead|fatal|exception/.test(t)) return 'error';
  if (/warn|disconnect|timeout|retry|reconnect/.test(t)) return 'warn';
  if (/debug|trace/.test(t)) return 'debug';
  return 'info';
}

function parseLine(raw: string): LogLine {
  // Docker timestamp format: 2024-01-15T10:30:00.000000000Z <message>
  const tsMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)/s);
  if (tsMatch) {
    const ts  = new Date(tsMatch[1]).toLocaleTimeString();
    const msg = tsMatch[2].trim();
    return { raw, ts, level: detectLevel(msg), msg };
  }
  return { raw, ts: '', level: detectLevel(raw), msg: raw.trim() };
}

// ── Logs view ─────────────────────────────────────────────────────────────────

const LEVELS: LogLevel[] = ['info', 'warn', 'error', 'debug'];

function LogsView({ node }: { node: FleetNode }) {
  const [lines, setLines]       = useState<LogLine[]>([]);
  const [filterText, setFilter] = useState('');
  const [filterLevel, setLevel] = useState<LogLevel | 'all'>('all');
  const [error, setError]       = useState<string | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const autoScroll              = useRef(true);

  useEffect(() => {
    setLines([]);
    setError(null);
    socket.emit('node:logs:subscribe', { nodeId: node.id });

    const onLine = ({ nodeId, line }: { nodeId: string; line: string }) => {
      if (nodeId !== node.id) return;
      setLines(prev => [...prev.slice(-500), parseLine(line)]);
    };
    const onError = ({ nodeId, message }: { nodeId: string; message: string }) => {
      if (nodeId === node.id) setError(message);
    };

    socket.on('node:logs:line',  onLine);
    socket.on('node:logs:error', onError);
    return () => {
      socket.emit('node:logs:unsubscribe', { nodeId: node.id });
      socket.off('node:logs:line',  onLine);
      socket.off('node:logs:error', onError);
    };
  }, [node.id]);

  useEffect(() => {
    if (autoScroll.current) bottomRef.current?.scrollIntoView();
  }, [lines]);

  const filtered = lines.filter(l => {
    if (filterLevel !== 'all' && l.level !== filterLevel) return false;
    if (filterText && !l.raw.toLowerCase().includes(filterText.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#020c1b' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, padding: '5px 10px', borderBottom: '1px solid #1e293b', flexShrink: 0, alignItems: 'center' }}>
        <input
          placeholder="filter…"
          value={filterText}
          onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, background: '#061322', border: '1px solid #1e293b', color: '#cbd5e1', padding: '3px 8px', fontSize: '0.65rem', borderRadius: 2, fontFamily: 'inherit', outline: 'none' }}
        />
        <select
          value={filterLevel}
          onChange={e => setLevel(e.target.value as LogLevel | 'all')}
          style={{ background: '#061322', border: '1px solid #1e293b', color: '#475569', padding: '3px 6px', fontSize: '0.65rem', borderRadius: 2, outline: 'none' }}
        >
          <option value="all">all</option>
          {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button
          onClick={() => setLines([])}
          style={{ background: 'transparent', border: '1px solid #1e293b', color: '#475569', padding: '2px 8px', fontSize: '0.62rem', borderRadius: 2, cursor: 'pointer' }}
        >
          clear
        </button>
      </div>

      {/* Lines */}
      <div
        style={{ flex: 1, overflow: 'auto', padding: '6px 12px', fontFamily: '"Cascadia Code", "Fira Code", monospace', fontSize: '0.65rem', lineHeight: 1.65 }}
        onScroll={e => {
          const el = e.currentTarget;
          autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {error && (
          <div style={{ color: '#f87171', marginBottom: 8 }}>⚠ {error}</div>
        )}
        {!error && lines.length === 0 && (
          <div style={{ color: '#334155' }}>waiting for logs…</div>
        )}
        {filtered.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 10 }}>
            {l.ts && <span style={{ color: '#334155', flexShrink: 0 }}>{l.ts}</span>}
            <span style={{ color: LEVEL_COLOR[l.level] }}>{l.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Shell view (xterm.js) ─────────────────────────────────────────────────────

function ShellView({ node }: { node: FleetNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<Terminal | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background:  '#020c1b',
        foreground:  '#cbd5e1',
        cursor:      '#4ade80',
        black:       '#0f172a',
        brightBlack: '#334155',
      },
      fontFamily:  '"Cascadia Code", "Fira Code", monospace',
      fontSize:    12,
      lineHeight:  1.4,
      cursorBlink: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current  = fit;

    socket.emit('node:shell:open', { nodeId: node.id, cols: term.cols, rows: term.rows });

    const onOutput = ({ nodeId, data }: { nodeId: string; data: string }) => {
      if (nodeId === node.id) term.write(data);
    };
    const onError = ({ nodeId, message }: { nodeId: string; message: string }) => {
      if (nodeId === node.id) term.write(`\r\n\x1b[31m⚠ ${message}\x1b[0m\r\n`);
    };

    socket.on('node:shell:output', onOutput);
    socket.on('node:shell:error',  onError);

    term.onData(data => socket.emit('node:shell:input', { nodeId: node.id, data }));

    const ro = new ResizeObserver(() => {
      fit.fit();
      socket.emit('node:shell:resize', { nodeId: node.id, cols: term.cols, rows: term.rows });
    });
    ro.observe(containerRef.current);

    return () => {
      socket.emit('node:shell:close', { nodeId: node.id });
      socket.off('node:shell:output', onOutput);
      socket.off('node:shell:error',  onError);
      ro.disconnect();
      term.dispose();
    };
  }, [node.id]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, padding: '6px 4px', background: '#020c1b', overflow: 'hidden' }}
    />
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

type Tab = 'logs' | 'shell';

export default function ScreenPanel({ node }: { node: FleetNode }) {
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <div style={{ background: '#020c1b', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ height: 34, background: '#0d1f35', borderBottom: '1px solid #1e293b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {(['logs', 'shell'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? '#4ade80' : 'transparent'}`,
              color: tab === t ? '#f1f5f9' : '#475569',
              padding: '0 14px',
              height: '100%',
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
        <span style={{ marginLeft: 'auto', paddingRight: 12, color: '#334155', fontSize: '0.62rem' }}>
          {node.name}
        </span>
      </div>

      {tab === 'logs'  && <LogsView  node={node} />}
      {tab === 'shell' && <ShellView node={node} />}
    </div>
  );
}
