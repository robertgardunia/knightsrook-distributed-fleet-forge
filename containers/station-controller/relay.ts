/**
 * Station-controller relay.
 *
 * Sits on two networks:
 *   fleet-net      — upstream to homebase
 *   station-XX-net — downstream to kiosks
 *
 * Kiosks connect here exactly as they would to homebase (same socket.io
 * event protocol). Relay forwards their registrations and heartbeats
 * upstream, enriched with network address, and pushes fleet:graph back down.
 *
 * Maintains a local mini-registry: tracks kiosk heartbeat state and records
 * all events (register/alerting/dead/recovered) to local SQLite — the Noble's
 * own record of its kiosks, independent of homebase connectivity.
 */
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { recordEvent, getHistory, getAllSince } from './telemetry.js';
import { FileQueue } from '@knightsrook/xapi/file-queue';
import type { XApiStatement } from '@knightsrook/xapi';

const AGENT_ID     = process.env.AGENT_ID!;
const AGENT_NAME   = process.env.AGENT_NAME!;
const HOMEBASE_URL = process.env.HOMEBASE_URL ?? 'http://homebase:5020';
const RELAY_PORT   = Number(process.env.RELAY_PORT ?? 5021);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 5000);

const ALERT_THRESHOLD_MS   =  9_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;

if (!AGENT_ID || !AGENT_NAME) {
  console.error('AGENT_ID and AGENT_NAME are required');
  process.exit(1);
}

// ── Local kiosk registry ─────────────────────────────────────────────────────

interface KioskRecord {
  id:       string;
  role:     string;
  address:  string;
  lastSeen: number;
  status:   'alive' | 'alerting' | 'dead';
}

const kiosks = new Map<string, KioskRecord>();

setInterval(() => {
  const now = Date.now();
  for (const kiosk of kiosks.values()) {
    const age = now - kiosk.lastSeen;
    if (kiosk.status !== 'dead' && age > HEARTBEAT_TIMEOUT_MS) {
      kiosk.status = 'dead';
      recordEvent(kiosk.id, 'dead');
    } else if (kiosk.status === 'alive' && age > ALERT_THRESHOLD_MS) {
      kiosk.status = 'alerting';
      recordEvent(kiosk.id, 'alerting');
    }
  }
}, 5_000);

// ── xAPI queue + LRS gate ─────────────────────────────────────────────────────

const queue = new FileQueue(path.resolve(process.cwd(), 'data', 'xapi-queue.jsonl'));
let lrsEnabled = false;

// ── Upstream: connect to homebase ─────────────────────────────────────────────

const upstream = ioClient(HOMEBASE_URL, { reconnectionDelay: 2000, reconnectionDelayMax: 10_000 });

upstream.on('connect', () => {
  console.log(`[${AGENT_ID}] upstream connected to homebase`);
  upstream.emit('agent:register', {
    id:       AGENT_ID,
    name:     AGENT_NAME,
    role:     'station-controller',
    parentId: 'homebase',
  });
  if (lrsEnabled) {
    const queued = queue.size();
    if (queued > 0) {
      console.log(`[${AGENT_ID}] flushing ${queued} queued xAPI statements`);
      queue.flush((stmt) => upstream.emit('xapi:statement', stmt));
    }
  }
});

upstream.on('disconnect', (reason) => console.log(`[${AGENT_ID}] upstream disconnected: ${reason}`));
upstream.on('connect_error', (err) => console.log(`[${AGENT_ID}] upstream error: ${err.message}`));

setInterval(() => {
  if (upstream.connected) upstream.emit('agent:heartbeat', { id: AGENT_ID });
}, HEARTBEAT_MS);

setInterval(() => {
  if (upstream.connected) upstream.emit('xapi:queue:size', { nodeId: AGENT_ID, queued: queue.size() });
}, 5_000);

// ── Downstream: relay server for kiosks ──────────────────────────────────────

const http = createServer((req, res) => {
  if (!req.url || req.method !== 'GET') { res.writeHead(404); res.end(); return; }

  // GET /telemetry/:nodeId[?window=<ms>]
  const nodeMatch = req.url.match(/^\/telemetry\/([^?]+)/);
  if (nodeMatch) {
    const nodeId    = decodeURIComponent(nodeMatch[1]);
    const qs        = new URL(req.url, 'http://localhost').searchParams;
    const windowMs  = Number(qs.get('window')) || 300_000;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getHistory(nodeId, windowMs)));
    return;
  }

  // GET /telemetry?since=<ts>  — full gap sync for homebase pull
  if (req.url.startsWith('/telemetry')) {
    const qs      = new URL(req.url, 'http://localhost').searchParams;
    const sinceTs = Number(qs.get('since')) || 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAllSince(sinceTs)));
    return;
  }

  res.writeHead(404); res.end();
});

const downstream = new Server(http, { cors: { origin: '*' } });

downstream.on('connection', (socket) => {
  const remoteAddress = socket.handshake.address;
  socket.emit('xapi:lrs:set', { enabled: lrsEnabled });

  socket.on('agent:register', (data) => {
    const address = remoteAddress;
    console.log(`[${AGENT_ID}] relaying register for ${data.id} @ ${address}`);

    kiosks.set(data.id, {
      id:       data.id,
      role:     data.role,
      address,
      lastSeen: Date.now(),
      status:   'alive',
    });

    recordEvent(data.id, 'register', { address, role: data.role, name: data.name });
    upstream.emit('agent:register', { ...data, address });
  });

  socket.on('agent:heartbeat', (data) => {
    upstream.emit('agent:heartbeat', data);
    const kiosk = kiosks.get(data.id);
    if (kiosk) {
      const wasDead = kiosk.status === 'dead';
      kiosk.lastSeen = Date.now();
      kiosk.status   = 'alive';
      if (wasDead) recordEvent(data.id, 'recovered');
    }
  });

  socket.on('fleet:request', () => {
    upstream.emit('fleet:request');
  });

  socket.on('xapi:statement', (stmt: XApiStatement) => {
    if (upstream.connected && lrsEnabled) {
      upstream.emit('xapi:statement', stmt);
    } else {
      queue.push(stmt);
    }
  });

  socket.on('xapi:queue:size', (data: { nodeId: string; queued: number }) => {
    if (upstream.connected) upstream.emit('xapi:queue:size', data);
  });

  // Relay emulate:ready from kiosk back upstream to dashboard
  socket.on('kiosk:emulate:ready', (data: unknown) => upstream.emit('kiosk:emulate:ready', data));
});

// Relay xAPI LRS toggle from homebase down to kiosks
upstream.on('xapi:lrs:set', ({ enabled }: { enabled: boolean }) => {
  lrsEnabled = enabled;
  console.log(`[${AGENT_ID}] xAPI LRS ${enabled ? 'enabled' : 'disabled'}`);
  if (enabled && upstream.connected) {
    const queued = queue.size();
    if (queued > 0) {
      console.log(`[${AGENT_ID}] flushing ${queued} queued xAPI statements`);
      queue.flush((stmt) => upstream.emit('xapi:statement', stmt));
    }
  }
  downstream.emit('xapi:lrs:set', { enabled });
});

// Relay emulate control events from homebase down to kiosks
upstream.on('kiosk:emulate:start', (data: { nodeId: string }) => {
  if (kiosks.has(data.nodeId)) downstream.emit('kiosk:emulate:start', data);
});
upstream.on('kiosk:emulate:stop', (data: { nodeId: string }) => {
  if (kiosks.has(data.nodeId)) downstream.emit('kiosk:emulate:stop', data);
});
upstream.on('kiosk:scan', (data: { nodeId: string; value: string }) => {
  if (kiosks.has(data.nodeId)) downstream.emit('kiosk:scan', data);
});

// Push fleet graph updates down to connected kiosks
upstream.on('fleet:graph', (graph) => {
  downstream.emit('fleet:graph', graph);
});

http.listen(RELAY_PORT, () => {
  console.log(`[${AGENT_ID}] relay listening on :${RELAY_PORT}`);
});

console.log(`[${AGENT_ID}] starting — homebase=${HOMEBASE_URL} relay=:${RELAY_PORT}`);
