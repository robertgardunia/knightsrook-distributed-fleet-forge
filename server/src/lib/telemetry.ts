import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import type { NodeStats } from './containerStreams.js';

const DB_PATH = process.env.TELEMETRY_DB ?? path.resolve(process.cwd(), 'data', 'telemetry.db');
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS node_stats (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id   TEXT    NOT NULL,
    ts        INTEGER NOT NULL,
    cpu       REAL    NOT NULL,
    mem_used  INTEGER NOT NULL,
    mem_total INTEGER NOT NULL,
    net_in    INTEGER NOT NULL,
    net_out   INTEGER NOT NULL,
    uptime    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stats ON node_stats (node_id, ts);

  CREATE TABLE IF NOT EXISTS node_events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT    NOT NULL,
    event   TEXT    NOT NULL,
    ts      INTEGER NOT NULL,
    meta    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events ON node_events (node_id, ts);
`);

const insertStats = db.prepare(
  `INSERT INTO node_stats (node_id, ts, cpu, mem_used, mem_total, net_in, net_out, uptime)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertEvent = db.prepare(
  `INSERT INTO node_events (node_id, event, ts, meta) VALUES (?, ?, ?, ?)`
);

const queryStats = db.prepare<[string, number], {
  ts: number; cpu: number; mem_used: number; mem_total: number;
  net_in: number; net_out: number; uptime: number;
}>(
  `SELECT ts, cpu, mem_used, mem_total, net_in, net_out, uptime
   FROM node_stats WHERE node_id = ? AND ts >= ? ORDER BY ts ASC`
);

const queryEvents = db.prepare<[string, number], {
  ts: number; event: string; meta: string | null;
}>(
  `SELECT ts, event, meta FROM node_events
   WHERE node_id = ? AND ts >= ? ORDER BY ts ASC`
);

// One write per node per 5 seconds — enough resolution to detect degradation curves
const lastWrite = new Map<string, number>();
const STATS_INTERVAL_MS = 5_000;

export function recordStats(nodeId: string, stats: NodeStats): void {
  const now = Date.now();
  if ((now - (lastWrite.get(nodeId) ?? 0)) < STATS_INTERVAL_MS) return;
  lastWrite.set(nodeId, now);
  try {
    insertStats.run(nodeId, now, stats.cpu, stats.memUsed, stats.memTotal, stats.netInRate, stats.netOutRate, stats.uptime);
  } catch (err) {
    console.warn('[telemetry] stats write failed:', err);
  }
}

export function recordEvent(nodeId: string, event: string, meta?: Record<string, unknown>): void {
  try {
    insertEvent.run(nodeId, event, Date.now(), meta ? JSON.stringify(meta) : null);
    console.log(`[telemetry] ${nodeId} → ${event}`);
  } catch (err) {
    console.warn('[telemetry] event write failed:', err);
  }
}

export interface NodeHistory {
  nodeId:   string;
  windowMs: number;
  stats:    Array<{ ts: number; cpu: number; memUsed: number; memTotal: number; netInRate: number; netOutRate: number; uptime: number }>;
  events:   Array<{ ts: number; event: string; meta: unknown }>;
}

export function getHistory(nodeId: string, windowMs = 300_000): NodeHistory {
  const since = Date.now() - windowMs;
  const stats = queryStats.all(nodeId, since).map(r => ({
    ts: r.ts,
    cpu: r.cpu,
    memUsed: r.mem_used,
    memTotal: r.mem_total,
    netInRate: r.net_in,
    netOutRate: r.net_out,
    uptime: r.uptime,
  }));
  const events = queryEvents.all(nodeId, since).map(r => ({
    ts: r.ts,
    event: r.event,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));
  return { nodeId, windowMs, stats, events };
}
