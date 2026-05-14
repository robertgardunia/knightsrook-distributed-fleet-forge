import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { buildMockFleet } from './lib/mockFleet.js';
import { FleetRegistry } from './lib/fleetRegistry.js';
import { streamLogs, openShell, type ShellHandle, streamStats, type NodeStats } from './lib/containerStreams.js';
import { recordStats, recordEvent } from './lib/telemetry.js';
import { Dispatcher } from './lib/dispatcher.js';
import { setEmit, getChaosAutoEnabled } from './routes/index.js';
import { relay as relayXapi, setLrsEnabled, getLrsStatus, flushQueue } from './lib/xapiRelay.js';

const PORT     = Number(process.env.PORT) || 5020;
const USE_MOCK = process.env.USE_MOCK === 'true';

// dispatcher is assigned after io is created; the closure captures it at call time
let dispatcher: Dispatcher;

const registry = new FleetRegistry(
  () => { io.emit('fleet:graph', getGraph()); },
  (nodeId, event) => {
    recordEvent(nodeId, event);
    dispatcher?.handleEvent(nodeId, event);
  },
);

const httpServer = createServer(createApp(registry));
const io = new Server(httpServer, { cors: { origin: '*' } });

dispatcher = new Dispatcher(registry, io);
setEmit(io.emit.bind(io));

const xapiQueueSizes = new Map<string, number>();

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

  // ── Chaos agent visibility — relay to all dashboard clients ────────────────
  socket.emit('chaos:auto', { enabled: getChaosAutoEnabled(), at: Date.now() });
  socket.on('chaos:action', (data) => io.emit('chaos:action', data));

  // ── xAPI relay — receive from station controllers, POST to Learning Locker ──
  socket.on('xapi:statement', (stmt: unknown) => { relayXapi(stmt).catch(console.error); });

  // ── xAPI queue size reports from kiosks / station controllers ──────────────
  socket.on('xapi:queue:size', ({ nodeId, queued }: { nodeId: string; queued: number }) => {
    xapiQueueSizes.set(nodeId, queued);
    io.emit('xapi:queues', Object.fromEntries(xapiQueueSizes));
  });

  // ── xAPI LRS toggle ────────────────────────────────────────────────────────
  socket.emit('xapi:lrs:status', getLrsStatus());
  socket.emit('xapi:queues', Object.fromEntries(xapiQueueSizes));
  socket.on('xapi:lrs:set', ({ enabled }: { enabled: boolean }) => {
    setLrsEnabled(enabled);
    if (enabled) flushQueue().catch(console.error);
    io.emit('xapi:lrs:set', { enabled });       // cascade down to station controllers
    io.emit('xapi:lrs:status', getLrsStatus());
  });

  // ── Kiosk emulation — relay control events through the fleet ─────────────
  socket.on('kiosk:emulate:start', (data: unknown) => io.emit('kiosk:emulate:start', data));
  socket.on('kiosk:emulate:stop',  (data: unknown) => io.emit('kiosk:emulate:stop',  data));
  socket.on('kiosk:scan',          (data: unknown) => io.emit('kiosk:scan',          data));
  socket.on('kiosk:emulate:ready', (data: unknown) => io.emit('kiosk:emulate:ready', data));

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
      await streamStats(nodeId, (stats: NodeStats) => {
        socket.emit('node:stats:data', { nodeId, stats });
        recordStats(nodeId, stats);
      }, ac.signal);
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

// Retry LRS + broadcast queue status every 30s
setInterval(() => {
  flushQueue().catch(console.error);
  xapiQueueSizes.set('homebase', getLrsStatus().queued);
  io.emit('xapi:lrs:status', getLrsStatus());
  io.emit('xapi:queues', Object.fromEntries(xapiQueueSizes));
}, 30_000);

process.on('unhandledRejection', (reason) => {
  console.error('[HOMEBASE] unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[HOMEBASE] uncaughtException:', err);
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} — mode: ${USE_MOCK ? 'mock' : 'live (mock fallback when empty)'}`);
});
