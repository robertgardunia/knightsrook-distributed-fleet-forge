import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const DATA_PATH     = path.resolve(process.cwd(), 'data', 'playbook.json');
const MAX_INCIDENTS = 500;

export interface IncidentAction { action: string; reason: string; ts: number; }

interface IncidentRecord {
  incidentId:  string;
  nodeId:      string;
  event:       string;
  faultType:   string | null;
  actions:     IncidentAction[];
  outcome:     'resolved' | 'escalated' | 'timeout' | null;
  durationMs:  number | null;
  notes:       string | null;
  ts:          number;
}

export interface PatternEntry {
  faultSig:      string;
  bestResponse:  string;
  successCount:  number;
  failureCount:  number;
  avgDurationMs: number;
}

interface PlaybookData {
  patterns:  Record<string, PatternEntry>;
  incidents: IncidentRecord[];
}

function load(): PlaybookData {
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf8')) as PlaybookData;
  } catch {
    return { patterns: {}, incidents: [] };
  }
}

function save(data: PlaybookData): void {
  try {
    mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('[playbook] save failed:', err);
  }
}

const store = load();

export function openIncident(incidentId: string, nodeId: string, event: string): void {
  if (store.incidents.some(i => i.incidentId === incidentId)) return;
  store.incidents.push({
    incidentId, nodeId, event,
    faultType: null, actions: [], outcome: null, durationMs: null, notes: null,
    ts: Date.now(),
  });
  if (store.incidents.length > MAX_INCIDENTS) store.incidents.shift();
  save(store);
}

export function closeIncident(
  incidentId: string,
  outcome: 'resolved' | 'escalated' | 'timeout',
  durationMs: number,
  actions: IncidentAction[],
  notes: string,
  faultType?: string,
): void {
  const rec = store.incidents.find(i => i.incidentId === incidentId);
  if (rec) {
    rec.outcome    = outcome;
    rec.durationMs = durationMs;
    rec.actions    = actions;
    rec.notes      = notes;
    rec.faultType  = faultType ?? null;
  }
  save(store);
}

export function getPatterns(): PatternEntry[] {
  return Object.values(store.patterns).sort(
    (a, b) => b.successCount - a.successCount || a.failureCount - b.failureCount,
  );
}

export function recordPatternResult(
  faultSig: string,
  response: string,
  success: boolean,
  durationMs: number,
): void {
  const existing = store.patterns[faultSig];
  if (!existing) {
    store.patterns[faultSig] = {
      faultSig,
      bestResponse:  response,
      successCount:  success ? 1 : 0,
      failureCount:  success ? 0 : 1,
      avgDurationMs: durationMs,
    };
  } else {
    const wins   = existing.successCount + (success ? 1 : 0);
    const losses = existing.failureCount + (success ? 0 : 1);
    const total  = wins + losses;
    existing.successCount  = wins;
    existing.failureCount  = losses;
    existing.avgDurationMs = Math.round((existing.avgDurationMs * (total - 1) + durationMs) / total);
    if (success) existing.bestResponse = response;
  }
  save(store);
}

export function getRecentIncidents(limit = 20): Array<{
  incidentId: string; nodeId: string; event: string;
  faultType: string | null; outcome: string | null; durationMs: number | null; ts: number;
}> {
  return [...store.incidents]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map(r => ({
      incidentId: r.incidentId,
      nodeId:     r.nodeId,
      event:      r.event,
      faultType:  r.faultType,
      outcome:    r.outcome,
      durationMs: r.durationMs,
      ts:         r.ts,
    }));
}
