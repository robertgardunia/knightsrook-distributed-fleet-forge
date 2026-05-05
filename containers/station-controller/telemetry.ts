import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const DATA_PATH = path.resolve(process.cwd(), 'data', 'telemetry.json');
const MAX_EVENTS = 10_000;

interface EventRecord {
  nodeId: string;
  ts:     number;
  event:  string;
  meta:   unknown;
}

function load(): EventRecord[] {
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf8')) as EventRecord[];
  } catch {
    return [];
  }
}

function save(evts: EventRecord[]): void {
  try {
    mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    writeFileSync(DATA_PATH, JSON.stringify(evts));
  } catch (err) {
    console.warn('[telemetry] save failed:', err);
  }
}

let events = load();

export function recordEvent(nodeId: string, event: string, meta?: Record<string, unknown>): void {
  events.push({ nodeId, ts: Date.now(), event, meta: meta ?? null });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  save(events);
  console.log(`[telemetry] ${nodeId} → ${event}`);
}

export function getHistory(nodeId: string, windowMs = 300_000) {
  const since = Date.now() - windowMs;
  return {
    nodeId,
    windowMs,
    events: events
      .filter(e => e.nodeId === nodeId && e.ts >= since)
      .map(e => ({ ts: e.ts, event: e.event, meta: e.meta })),
  };
}

export function getAllSince(sinceTs: number) {
  return events
    .filter(e => e.ts >= sinceTs)
    .map(e => ({ nodeId: e.nodeId, ts: e.ts, event: e.event, meta: e.meta }));
}
