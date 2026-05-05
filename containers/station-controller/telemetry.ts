import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';

const DB_PATH = process.env.TELEMETRY_DB ?? path.resolve(process.cwd(), 'data', 'telemetry.db');
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS node_events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT    NOT NULL,
    event   TEXT    NOT NULL,
    ts      INTEGER NOT NULL,
    meta    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events ON node_events (node_id, ts);
`);

const insertEvent = db.prepare(
  `INSERT INTO node_events (node_id, event, ts, meta) VALUES (?, ?, ?, ?)`
);

const queryEvents = db.prepare<[string, number], { ts: number; event: string; meta: string | null }>(
  `SELECT ts, event, meta FROM node_events WHERE node_id = ? AND ts >= ? ORDER BY ts ASC`
);

const queryAllSince = db.prepare<[number], { node_id: string; ts: number; event: string; meta: string | null }>(
  `SELECT node_id, ts, event, meta FROM node_events WHERE ts >= ? ORDER BY ts ASC`
);

export function recordEvent(nodeId: string, event: string, meta?: Record<string, unknown>): void {
  try {
    insertEvent.run(nodeId, event, Date.now(), meta ? JSON.stringify(meta) : null);
    console.log(`[telemetry] ${nodeId} → ${event}`);
  } catch (err) {
    console.warn('[telemetry] write failed:', err);
  }
}

export function getHistory(nodeId: string, windowMs = 300_000) {
  const since = Date.now() - windowMs;
  const events = queryEvents.all(nodeId, since).map(r => ({
    ts: r.ts,
    event: r.event,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));
  return { nodeId, windowMs, events };
}

// Used by homebase pull-sync: all events since a given timestamp across all nodes
export function getAllSince(sinceTs: number) {
  return queryAllSince.all(sinceTs).map(r => ({
    nodeId: r.node_id,
    ts: r.ts,
    event: r.event,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));
}
