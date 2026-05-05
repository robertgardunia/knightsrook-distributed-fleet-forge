import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordStats, recordEvent, getHistory } from './telemetry.js';
import type { NodeStats } from './containerStreams.js';

const MOCK_STATS: NodeStats = {
  cpu: 42.5,
  memUsed:   512 * 1024 * 1024,
  memTotal: 1536 * 1024 * 1024,
  netInRate:  1024,
  netOutRate:  512,
  uptime: 3600,
  processes: [],
};

describe('telemetry', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('recordEvent() stores an event retrievable by getHistory()', () => {
    const nodeId = `node-evt-${Date.now()}`;
    recordEvent(nodeId, 'dead');
    const { events } = getHistory(nodeId);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('dead');
  });

  it('recordEvent() stores metadata', () => {
    const nodeId = `node-meta-${Date.now()}`;
    recordEvent(nodeId, 'register', { address: '10.0.0.5', role: 'game-kiosk' });
    const { events } = getHistory(nodeId);
    expect(events[0].meta).toEqual({ address: '10.0.0.5', role: 'game-kiosk' });
  });

  it('getHistory() respects the window — excludes events older than windowMs', () => {
    const nodeId = `node-win-${Date.now()}`;
    recordEvent(nodeId, 'register');
    vi.advanceTimersByTime(400_000);
    recordEvent(nodeId, 'alerting');
    // 5-min window — only the second event is within range
    const { events } = getHistory(nodeId, 300_000);
    expect(events.every(e => e.event !== 'register')).toBe(true);
    expect(events.some(e => e.event === 'alerting')).toBe(true);
  });

  it('recordStats() throttles to one write per 5s', () => {
    const nodeId = `node-stats-${Date.now()}`;
    recordStats(nodeId, MOCK_STATS);
    recordStats(nodeId, { ...MOCK_STATS, cpu: 99 });
    // Both called within same 5s window — only first write should exist
    const { stats } = getHistory(nodeId);
    expect(stats).toHaveLength(1);
    expect(stats[0].cpu).toBeCloseTo(42.5);
  });

  it('recordStats() allows a second write after 5s', () => {
    const nodeId = `node-stats2-${Date.now()}`;
    recordStats(nodeId, MOCK_STATS);
    vi.advanceTimersByTime(5_001);
    recordStats(nodeId, { ...MOCK_STATS, cpu: 77 });
    const { stats } = getHistory(nodeId);
    expect(stats).toHaveLength(2);
    expect(stats[1].cpu).toBeCloseTo(77);
  });

  it('getHistory() returns empty arrays for unknown nodes', () => {
    const { stats, events } = getHistory('no-such-node');
    expect(stats).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
