import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { buildMockFleet } from './lib/mockFleet.js';
import { FleetRegistry } from './lib/fleetRegistry.js';
import { streamLogs, openShell, type ShellHandle } from './lib/containerStreams.js';

const PORT     = Number(process.env.PORT) || 5020;
const USE_MOCK = process.env.USE_MOCK === 'true';

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const registry = new FleetRegistry(() => {
  if (!USE_MOCK) io.emit('fleet:graph', registry.buildGraph());
});

function getGraph() {
  return (USE_MOCK || registry.size === 0) ? buildMockFleet() : registry.buildGraph();
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
  socket.on('fleet:request', () => socket.emit('fleet:graph', getGraph()));

  // ── Agent registration ─────────────────────────────────────────────────────
  socket.on('agent:register', (data) => registry.register(data));
  socket.on('agent:heartbeat', (data) => registry.heartbeat(data.id));

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
