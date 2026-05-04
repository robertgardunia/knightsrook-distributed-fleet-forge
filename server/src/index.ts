import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { buildMockFleet } from './lib/mockFleet.js';
import { FleetRegistry } from './lib/fleetRegistry.js';
import { streamLogs, openShell, type ShellHandle, streamStats, type NodeStats } from './lib/containerStreams.js';

const PORT     = Number(process.env.PORT) || 5020;
const USE_MOCK = process.env.USE_MOCK === 'true';

const registry = new FleetRegistry(() => {
  io.emit('fleet:graph', getGraph());
});

const httpServer = createServer(createApp(registry));
const io = new Server(httpServer, { cors: { origin: '*' } });

function getGraph() {
  const isMock = USE_MOCK || registry.size === 0;
  return { ...(isMock ? buildMockFleet() : registry.buildGraph()), isMock };
}

io.on('connection', (socket) => {
  const aborts = new Map<string, AbortController>();
  const shells  = new Map<string, ShellHandle>();

  function abort(key: string) {
    aborts.get(key)?.abort();
    aborts.delete(key);
  }

  // ── Fleet graph ────────────────────────────────────────────────────────────
  socket.emit('fleet:graph', getGraph());
  socket.on('fleet:request', (opts?: { mock?: boolean }) => {
    const data = opts?.mock ? { ...buildMockFleet(), isMock: true } : getGraph();
    socket.emit('fleet:graph', data);
  });

  // ── Agent registration ─────────────────────────────────────────────────────
  socket.on('agent:register', (data) => registry.register(data));
  socket.on('agent:heartbeat', (data) => registry.heartbeat(data.id));

  // ── Kiosk state events (emitted by kiosk agents regardless of log subscribers)
  socket.on('kiosk:event', ({ id, type, player }: { id: string; type: string; player?: string }) => {
    if (type === 'SIGNIN' || type === 'VISITOR_ARRIVE') {
      registry.setActivePlayer(id, player ?? 'visitor');
    } else if (type === 'SIGNOUT' || type === 'VISITOR_DEPART') {
      registry.setActivePlayer(id, undefined);
    }
  });

  // ── Log streaming ──────────────────────────────────────────────────────────
  socket.on('node:logs:subscribe', async ({ nodeId }: { nodeId: string }) => {
    const key = `logs:${nodeId}`;
    abort(key);
    const ac = new AbortController();
    aborts.set(key, ac);
    try {
      await streamLogs(nodeId, (line) => socket.emit('node:logs:line', { nodeId, line }), ac.signal);
    } catch (err) {
      socket.emit('node:logs:error', { nodeId, message: String(err) });
    }
  });

  socket.on('node:logs:unsubscribe', ({ nodeId }: { nodeId: string }) => {
    abort(`logs:${nodeId}`);
  });

  // ── Stats streaming ──────────────────────────────────────────────────────────
  socket.on('node:stats:subscribe', async ({ nodeId }: { nodeId: string }) => {
    const key = `stats:${nodeId}`;
    abort(key);
    const ac = new AbortController();
    aborts.set(key, ac);
    try {
      await streamStats(nodeId, (stats: NodeStats) => socket.emit('node:stats:data', { nodeId, stats }), ac.signal);
    } catch (err) {
      socket.emit('node:stats:error', { nodeId, message: String(err) });
    }
  });

  socket.on('node:stats:unsubscribe', ({ nodeId }: { nodeId: string }) => {
    abort(`stats:${nodeId}`);
  });

  // ── Shell ──────────────────────────────────────────────────────────────────
  socket.on('node:shell:open', async ({ nodeId, cols, rows }: { nodeId: string; cols: number; rows: number }) => {
    const key = `shell:${nodeId}`;
    abort(key);
    shells.delete(key);
    const ac = new AbortController();
    aborts.set(key, ac);
    try {
      const handle = await openShell(
        nodeId,
        (data) => socket.emit('node:shell:output', { nodeId, data }),
        ac.signal,
      );
      shells.set(key, handle);
      await handle.resize(cols, rows);
      socket.emit('node:shell:ready', { nodeId });
    } catch (err) {
      socket.emit('node:shell:error', { nodeId, message: String(err) });
    }
  });

  socket.on('node:shell:input',  ({ nodeId, data }: { nodeId: string; data: string }) => {
    shells.get(`shell:${nodeId}`)?.write(data);
  });

  socket.on('node:shell:resize', ({ nodeId, cols, rows }: { nodeId: string; cols: number; rows: number }) => {
    shells.get(`shell:${nodeId}`)?.resize(cols, rows);
  });

  socket.on('node:shell:close', ({ nodeId }: { nodeId: string }) => {
    abort(`shell:${nodeId}`);
    shells.delete(`shell:${nodeId}`);
  });

  socket.on('disconnect', () => {
    aborts.forEach(ac => ac.abort());
    aborts.clear();
    shells.clear();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} — mode: ${USE_MOCK ? 'mock' : 'live (mock fallback when empty)'}`);
});
