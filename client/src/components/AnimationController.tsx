import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { pushAnimation, clearType, clearAll } from '../lib/nodeAnimations';

interface Toast {
  id:    string;
  text:  string;
  color: string;
  bg:    string;
  border: string;
}

const NETWORK_TOOLS = new Set([
  'inject_latency', 'inject_packet_loss', 'inject_bandwidth', 'reset_network',
]);

function resolveNodeId(tool: string, target: string): string | null {
  if (NETWORK_TOOLS.has(tool)) {
    const m = target.match(/^(s\d+)-upstream$/);
    return m ? `${m[1]}-controller` : null;
  }
  return target || null;
}

function toolLabel(tool: string): string {
  return tool.replace(/_/g, ' ');
}

export default function AnimationController() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  function addToast(t: Omit<Toast, 'id'>) {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...t, id }].slice(-6));
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 3500);
  }

  useEffect(() => {
    // Clear all stale animations when the fleet graph is received fresh (reconnect/mode switch)
    function onFleetGraph() { clearAll(); }
    socket.on('fleet:graph', onFleetGraph);
    return () => { socket.off('fleet:graph', onFleetGraph); };
  }, []);

  useEffect(() => {
    function onChaosAction(data: { tool: string; target: string; reason: string }) {
      const nodeId = resolveNodeId(data.tool, data.target);
      if (nodeId) {
        pushAnimation(nodeId, { type: 'chaos-shockwave', startedAt: Date.now(), durationMs: 1600 });
      }
      const isReset = data.tool === 'reset_network';
      addToast({
        text:   `⚡ ${toolLabel(data.tool)} → ${data.target}`,
        color:  isReset ? '#fbbf24' : '#fca5a5',
        bg:     isReset ? '#451a03' : '#450a0a',
        border: isReset ? '#78350f' : '#7f1d1d',
      });
    }

    function onFiremanSpawned(data: { nodeId: string; faultType?: string }) {
      pushAnimation(data.nodeId, { type: 'fireman-pulse', startedAt: Date.now() });
      addToast({
        text:   `🔥 Recovery → ${data.nodeId}${data.faultType ? ` (${data.faultType})` : ''}`,
        color:  '#93c5fd',
        bg:     '#0c1a2e',
        border: '#1e3a5f',
      });
    }

    function onFiremanResolved(data: { nodeId: string }) {
      clearType(data.nodeId, 'fireman-pulse');
      pushAnimation(data.nodeId, { type: 'recovery-burst', startedAt: Date.now(), durationMs: 2200 });
      addToast({
        text:   `✓ ${data.nodeId} recovered`,
        color:  '#86efac',
        bg:     '#052e16',
        border: '#14532d',
      });
    }

    function onFiremanEscalated(data: { nodeId: string }) {
      clearType(data.nodeId, 'fireman-pulse');
    }

    socket.on('chaos:action',      onChaosAction);
    socket.on('fireman:spawned',   onFiremanSpawned);
    socket.on('fireman:resolved',  onFiremanResolved);
    socket.on('fireman:escalated', onFiremanEscalated);
    return () => {
      socket.off('chaos:action',      onChaosAction);
      socket.off('fireman:spawned',   onFiremanSpawned);
      socket.off('fireman:resolved',  onFiremanResolved);
      socket.off('fireman:escalated', onFiremanEscalated);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 62, left: '50%', transform: 'translateX(-50%)',
      zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className="toast"
          style={{
            background: t.bg,
            border: `1px solid ${t.border}`,
            color: t.color,
            padding: '5px 16px',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: '0.72rem',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
