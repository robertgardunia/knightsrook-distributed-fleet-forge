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

// ── Demo log sources ─────────────────────────────────────────────────────────

const DEMO_LOGS: Record<string, string[]> = {
  homebase: [
    'info Fleet registry online — 29 nodes connected',
    'info Station S1 heartbeat OK (6/6 kiosks alive)',
    'info Station S2 heartbeat OK (6/6 kiosks alive)',
    'info Station S3 heartbeat OK (6/6 kiosks alive)',
    'info Station S4 heartbeat OK (6/6 kiosks alive)',
    'info Dashboard client connected from 192.168.1.42',
    'info fleet:graph broadcast → 1 client (29 nodes, 28 links)',
    'info agent:heartbeat received: s3-game-2',
    'warn Station S2 missed heartbeat — retrying',
    'info Station S2 heartbeat restored',
    'info agent:heartbeat received: s1-info-1',
    'debug graph recomputed in 1ms',
  ],
  'station-controller': [
    'info Relay listening on :5021',
    'info Upstream connected → homebase:5020',
    'info Agent registered: game-kiosk KG1',
    'info Agent registered: game-kiosk KG2',
    'info Agent registered: game-kiosk KG3',
    'info Agent registered: game-kiosk KG4',
    'info Agent registered: info-kiosk KI1',
    'info Agent registered: info-kiosk KI2',
    'info fleet:graph received from homebase — broadcasting to 6 kiosks',
    'info agent:heartbeat received from KG3 — forwarding upstream',
    'warn upstream reconnect attempt 1/5',
    'info upstream reconnected',
    'info agent:heartbeat received from KI1 — forwarding upstream',
  ],
  'game-kiosk': [
    'info Game engine initialized',
    'info Display driver ready: 1920×1080 @ 60Hz',
    'info Asset cache warmed: 847 items loaded',
    'info Controller input detected: gamepad-0',
    'info Heartbeat sent → station-controller',
    'debug Frame render OK: 60fps',
    'info Network RTT to relay: 2ms',
    'info Heartbeat sent → station-controller',
    'warn Frame drop detected: 58fps (target 60)',
    'info Asset prefetch complete: level_02',
    'debug Frame render OK: 60fps',
    'info Heartbeat sent → station-controller',
  ],
  'info-kiosk': [
    'info Content scheduler started',
    'info Display orientation: landscape 0°',
    'info Event data synced: 12 upcoming events',
    'info Slide 1/8: Welcome — 15s',
    'info Heartbeat sent → station-controller',
    'info Slide 2/8: Schedule — 20s',
    'info Content refresh from CDN: OK (14 assets)',
    'info Heartbeat sent → station-controller',
    'info Slide 3/8: Sponsors — 10s',
    'warn CDN response slow: 420ms',
    'info Slide 4/8: Standings — 15s',
    'info Heartbeat sent → station-controller',
  ],
};

function makeDemoLine(msg: string): LogLine {
  const [level, ...rest] = msg.split(' ');
  const text = rest.join(' ');
  return { raw: msg, ts: new Date().toLocaleTimeString(), level: level as LogLevel, msg: text };
}

// ── Demo logs view ────────────────────────────────────────────────────────────

function DemoLogsView({ node }: { node: FleetNode }) {
  const source = DEMO_LOGS[node.role] ?? DEMO_LOGS['homebase'];
  const [lines, setLines] = useState<LogLine[]>(() => source.slice(0, 4).map(makeDemoLine));
  const [filterText, setFilter] = useState('');
  const [filterLevel, setLevel] = useState<LogLevel | 'all'>('all');
  const bottomRef = useRef<HTMLDivElement>(null);
  const idx = useRef(4);

  useEffect(() => {
    idx.current = 4;
    setLines(source.slice(0, 4).map(makeDemoLine));
  }, [node.id]);

  useEffect(() => {
    const id = setInterval(() => {
      const msg = source[idx.current % source.length];
      idx.current++;
      setLines(prev => [...prev.slice(-500), makeDemoLine(msg)]);
    }, 1800 + Math.random() * 1200);
    return () => clearInterval(id);
  }, [node.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [lines]);

  const filtered = lines.filter(l => {
    if (filterLevel !== 'all' && l.level !== filterLevel) return false;
    if (filterText && !l.msg.toLowerCase().includes(filterText.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#020c1b' }}>
      <div style={{ display: 'flex', gap: 6, padding: '5px 10px', borderBottom: '1px solid #1e293b', flexShrink: 0, alignItems: 'center' }}>
        <input placeholder="filter…" value={filterText} onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, background: '#061322', border: '1px solid #1e293b', color: '#cbd5e1', padding: '3px 8px', fontSize: '0.65rem', borderRadius: 2, fontFamily: 'inherit', outline: 'none' }} />
        <select value={filterLevel} onChange={e => setLevel(e.target.value as LogLevel | 'all')}
          style={{ background: '#061322', border: '1px solid #1e293b', color: '#475569', padding: '3px 6px', fontSize: '0.65rem', borderRadius: 2, outline: 'none' }}>
          <option value="all">all</option>
          {(['info','warn','error','debug'] as LogLevel[]).map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={() => setLines([])}
          style={{ background: 'transparent', border: '1px solid #1e293b', color: '#475569', padding: '2px 8px', fontSize: '0.62rem', borderRadius: 2, cursor: 'pointer' }}>
          clear
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 12px', fontFamily: '"Cascadia Code","Fira Code",monospace', fontSize: '0.65rem', lineHeight: 1.65 }}>
        {filtered.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 10 }}>
            <span style={{ color: '#334155', flexShrink: 0 }}>{l.ts}</span>
            <span style={{ color: LEVEL_COLOR[l.level] }}>{l.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Demo shell view ───────────────────────────────────────────────────────────

function runDemoCmd(term: Terminal, node: FleetNode, cmd: string) {
  const [prog, ...args] = cmd.trim().split(/\s+/);
  term.writeln('');
  switch (prog) {
    case '': break;
    case 'help':
      term.writeln('\x1b[90mcommands: ls  ps  env  uname  hostname  ping  cat  clear  help\x1b[0m');
      break;
    case 'ls':
      term.writeln('\x1b[34mapp\x1b[0m  \x1b[34mconfig\x1b[0m  \x1b[34mlogs\x1b[0m  \x1b[34mrun\x1b[0m');
      break;
    case 'ps':
      term.writeln('\x1b[90m  PID TTY      STAT   TIME COMMAND\x1b[0m');
      term.writeln('    1 ?        Ss     0:00 /bin/sh /start.sh');
      term.writeln('   12 ?        S      0:04 node agent.js');
      term.writeln('   31 pts/0    R+     0:00 ps');
      break;
    case 'env':
      term.writeln(`AGENT_ID=\x1b[32m${node.id}\x1b[0m`);
      term.writeln(`AGENT_NAME=\x1b[32m${node.name}\x1b[0m`);
      term.writeln(`AGENT_ROLE=\x1b[32m${node.role}\x1b[0m`);
      term.writeln(`NODE_ENV=\x1b[32mproduction\x1b[0m`);
      term.writeln(`HOMEBASE_URL=\x1b[32mhttp://homebase:5020\x1b[0m`);
      break;
    case 'uname':
      term.writeln('Linux fleet-node 5.15.0-107 #1 SMP x86_64 GNU/Linux');
      break;
    case 'hostname':
      term.writeln(node.id);
      break;
    case 'ping': {
      const host = args[0] || 'homebase';
      term.writeln(`PING ${host} (10.0.0.1): 56 data bytes`);
      [1,2,3].forEach(i => term.writeln(`64 bytes from ${host}: icmp_seq=${i} ttl=64 time=${(Math.random()*3+0.5).toFixed(2)} ms`));
      break;
    }
    case 'cat':
      if (args[0]?.includes('hostname')) term.writeln(node.id);
      else if (args[0]?.includes('os-release')) {
        term.writeln('NAME="Alpine Linux"'); term.writeln('VERSION_ID=3.19.0');
      } else term.writeln(`\x1b[31mcat: ${args[0] ?? ''}: No such file or directory\x1b[0m`);
      break;
    case 'clear':
      term.clear();
      break;
    default:
      term.writeln(`\x1b[31msh: ${prog}: command not found\x1b[0m`);
  }
}

function DemoShellView({ node }: { node: FleetNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      theme: { background: '#020c1b', foreground: '#cbd5e1', cursor: '#4ade80', black: '#0f172a', brightBlack: '#334155' },
      fontFamily: '"Cascadia Code","Fira Code",monospace',
      fontSize: 12, lineHeight: 1.4, cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    term.writeln('\x1b[32m── Offline Demo Shell ──────────────────────────\x1b[0m');
    term.writeln(`\x1b[90m  container : ${node.id}\x1b[0m`);
    term.writeln(`\x1b[90m  role      : ${node.role}\x1b[0m`);
    term.writeln('\x1b[90m  type "help" for available commands\x1b[0m');

    let line = '';
    const prompt = () => term.write(`\r\n\x1b[32m${node.id}\x1b[0m:\x1b[34m~\x1b[0m$ `);
    prompt();

    term.onData(data => {
      if (data === '\r') {
        runDemoCmd(term, node, line);
        line = '';
        prompt();
      } else if (data === '\x7f') {
        if (line.length > 0) { line = line.slice(0, -1); term.write('\b \b'); }
      } else if (data >= ' ') {
        line += data; term.write(data);
      }
    });

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); term.dispose(); };
  }, [node.id]);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0, padding: '6px 4px', background: '#020c1b', overflow: 'hidden' }} />;
}

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

export default function ScreenPanel({ node, isMock }: { node: FleetNode; isMock?: boolean }) {
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <div style={{ background: '#020c1b', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ height: 34, background: '#162d47', borderBottom: '1px solid #1e293b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
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

      {tab === 'logs'  && (isMock || node.role === 'homebase' ? <DemoLogsView  node={node} /> : <LogsView  node={node} />)}
      {tab === 'shell' && (isMock || node.role === 'homebase' ? <DemoShellView node={node} /> : <ShellView node={node} />)}
    </div>
  );
}
