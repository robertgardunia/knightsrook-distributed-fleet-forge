/**
 * Station-controller relay.
 *
 * Sits on two networks:
 *   fleet-net      — upstream to homebase
 *   station-XX-net — downstream to kiosks
 *
 * Kiosks connect here exactly as they would to homebase (same socket.io
 * event protocol). Relay forwards their registrations and heartbeats
 * upstream, and pushes fleet:graph updates back downstream.
 *
 * This is the cascade autonomy seam: kiosks never need a route to homebase.
 * When homebase is unreachable, this relay will gain island-mode logic later.
 */
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';

const AGENT_ID     = process.env.AGENT_ID!;
const AGENT_NAME   = process.env.AGENT_NAME!;
const HOMEBASE_URL = process.env.HOMEBASE_URL ?? 'http://homebase:5020';
const RELAY_PORT   = Number(process.env.RELAY_PORT ?? 5021);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 5000);

if (!AGENT_ID || !AGENT_NAME) {
  console.error('AGENT_ID and AGENT_NAME are required');
  process.exit(1);
}

// ── Upstream: connect to homebase ─────────────────────────────────────────
const upstream = ioClient(HOMEBASE_URL, { reconnectionDelay: 2000, reconnectionDelayMax: 10_000 });

upstream.on('connect', () => {
  console.log(`[${AGENT_ID}] upstream connected to homebase`);
  upstream.emit('agent:register', {
    id:       AGENT_ID,
    name:     AGENT_NAME,
    role:     'station-controller',
    parentId: 'homebase',
  });
});

upstream.on('disconnect', (reason) => console.log(`[${AGENT_ID}] upstream disconnected: ${reason}`));
upstream.on('connect_error', (err) => console.log(`[${AGENT_ID}] upstream error: ${err.message}`));

setInterval(() => {
  if (upstream.connected) upstream.emit('agent:heartbeat', { id: AGENT_ID });
}, HEARTBEAT_MS);

// ── Downstream: relay server for kiosks ──────────────────────────────────
const http = createServer();
const downstream = new Server(http, { cors: { origin: '*' } });

downstream.on('connection', (socket) => {
  socket.on('agent:register', (data) => {
    console.log(`[${AGENT_ID}] relaying register for ${data.id}`);
    upstream.emit('agent:register', data);
  });

  socket.on('agent:heartbeat', (data) => {
    upstream.emit('agent:heartbeat', data);
  });

  socket.on('fleet:request', () => {
    upstream.emit('fleet:request');
  });
});

// Push fleet graph updates down to connected kiosks
upstream.on('fleet:graph', (graph) => {
  downstream.emit('fleet:graph', graph);
});

http.listen(RELAY_PORT, () => {
  console.log(`[${AGENT_ID}] relay listening on :${RELAY_PORT}`);
});

console.log(`[${AGENT_ID}] starting — homebase=${HOMEBASE_URL} relay=:${RELAY_PORT}`);
