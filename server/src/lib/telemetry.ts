import type { NodeStats } from './containerStreams.js';

export interface NodeHistory {
  nodeId:   string;
  windowMs: number;
  stats:    Array<{ ts: number; cpu: number; memUsed: number; memTotal: number; netInRate: number; netOutRate: number; uptime: number }>;
  events:   Array<{ ts: number; event: string; meta: unknown }>;
}

const MAX_STATS_PER_NODE  = 720;  // 1 hour at 5s intervals
const MAX_EVENTS_PER_NODE = 500;
const STATS_INTERVAL_MS   = 5_000;

const statsStore  = new Map<string, Array<{ ts: number; cpu: number; memUsed: number; memTotal: number; netInRate: number; netOutRate: number; uptime: number }>>();
const eventsStore = new Map<string, Array<{ ts: number; event: string; meta: unknown }>>();
const lastWrite   = new Map<string, number>();

export function recordStats(nodeId: string, stats: NodeStats): void {
  const now = Date.now();
  if ((now - (lastWrite.get(nodeId) ?? 0)) < STATS_INTERVAL_MS) return;
  lastWrite.set(nodeId, now);
  if (!statsStore.has(nodeId)) statsStore.set(nodeId, []);
  const arr = statsStore.get(nodeId)!;
  arr.push({ ts: now, cpu: stats.cpu, memUsed: stats.memUsed, memTotal: stats.memTotal, netInRate: stats.netInRate, netOutRate: stats.netOutRate, uptime: stats.uptime });
  if (arr.length > MAX_STATS_PER_NODE) arr.shift();
}

export function recordEvent(nodeId: string, event: string, meta?: Record<string, unknown>): void {
  if (!eventsStore.has(nodeId)) eventsStore.set(nodeId, []);
  const arr = eventsStore.get(nodeId)!;
  arr.push({ ts: Date.now(), event, meta: meta ?? null });
  if (arr.length > MAX_EVENTS_PER_NODE) arr.shift();
  console.log(`[telemetry] ${nodeId} → ${event}`);
}

export function getHistory(nodeId: string, windowMs = 300_000): NodeHistory {
  const since  = Date.now() - windowMs;
  const stats  = (statsStore.get(nodeId) ?? []).filter(s => s.ts >= since);
  const events = (eventsStore.get(nodeId) ?? []).filter(e => e.ts >= since);
  return { nodeId, windowMs, stats, events };
}
