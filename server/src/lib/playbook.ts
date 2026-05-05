import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.PLAYBOOK_DB
  ?? path.resolve(process.cwd(), 'data', 'playbook.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id TEXT    NOT NULL UNIQUE,
    node_id     TEXT    NOT NULL,
    event       TEXT    NOT NULL,
    fault_type  TEXT,
    actions     TEXT,
    outcome     TEXT,
    duration_ms INTEGER,
    notes       TEXT,
    ts          INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS patterns (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    fault_sig       TEXT    NOT NULL UNIQUE,
    best_response   TEXT    NOT NULL,
    success_count   INTEGER NOT NULL DEFAULT 0,
    failure_count   INTEGER NOT NULL DEFAULT 0,
    avg_duration_ms INTEGER NOT NULL DEFAULT 0,
    last_updated    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
`);

export interface IncidentAction { action: string; reason: string; ts: number; }

export function openIncident(incidentId: string, nodeId: string, event: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO incidents (incident_id, node_id, event) VALUES (?, ?, ?)'
  ).run(incidentId, nodeId, event);
}

export function closeIncident(
  incidentId: string,
  outcome: 'resolved' | 'escalated' | 'timeout',
  durationMs: number,
  actions: IncidentAction[],
  notes: string,
  faultType?: string,
): void {
  db.prepare(`
    UPDATE incidents
    SET outcome=?, duration_ms=?, actions=?, notes=?, fault_type=?
    WHERE incident_id=?
  `).run(outcome, durationMs, JSON.stringify(actions), notes, faultType ?? null, incidentId);
}

export interface PatternEntry {
  faultSig: string;
  bestResponse: string;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
}

export function getPatterns(): PatternEntry[] {
  return (db.prepare(
    'SELECT * FROM patterns ORDER BY success_count DESC, failure_count ASC'
  ).all() as Array<{
    fault_sig: string; best_response: string;
    success_count: number; failure_count: number; avg_duration_ms: number;
  }>).map(r => ({
    faultSig:       r.fault_sig,
    bestResponse:   r.best_response,
    successCount:   r.success_count,
    failureCount:   r.failure_count,
    avgDurationMs:  r.avg_duration_ms,
  }));
}

export function recordPatternResult(
  faultSig: string,
  response: string,
  success: boolean,
  durationMs: number,
): void {
  const row = db.prepare('SELECT * FROM patterns WHERE fault_sig=?').get(faultSig) as
    { success_count: number; failure_count: number; avg_duration_ms: number } | undefined;

  if (!row) {
    db.prepare(`
      INSERT INTO patterns (fault_sig, best_response, success_count, failure_count, avg_duration_ms, last_updated)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(faultSig, response, success ? 1 : 0, success ? 0 : 1, durationMs, Date.now());
  } else {
    const wins  = row.success_count + (success ? 1 : 0);
    const losses = row.failure_count + (success ? 0 : 1);
    const total  = wins + losses;
    const avg    = Math.round((row.avg_duration_ms * (total - 1) + durationMs) / total);
    db.prepare(`
      UPDATE patterns
      SET success_count=?, failure_count=?, avg_duration_ms=?, best_response=?, last_updated=?
      WHERE fault_sig=?
    `).run(wins, losses, avg, response, Date.now(), faultSig);
  }
}

export function getRecentIncidents(limit = 20): Array<{
  incidentId: string; nodeId: string; event: string;
  faultType: string | null; outcome: string | null; durationMs: number | null; ts: number;
}> {
  return (db.prepare(
    'SELECT * FROM incidents ORDER BY ts DESC LIMIT ?'
  ).all(limit) as Array<{
    incident_id: string; node_id: string; event: string;
    fault_type: string | null; outcome: string | null; duration_ms: number | null; ts: number;
  }>).map(r => ({
    incidentId:  r.incident_id,
    nodeId:      r.node_id,
    event:       r.event,
    faultType:   r.fault_type,
    outcome:     r.outcome,
    durationMs:  r.duration_ms,
    ts:          r.ts,
  }));
}
