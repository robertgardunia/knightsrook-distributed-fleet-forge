import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  readFileSync:  vi.fn(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }),
  writeFileSync: vi.fn(),
  mkdirSync:     vi.fn(),
}));

import {
  recordPatternResult,
  getPatterns,
  openIncident,
  closeIncident,
  getNodeIncidentSummary,
  clearPlaybook,
} from './playbook.js';

describe('playbook', () => {
  beforeEach(() => { clearPlaybook(); });

  // ── recordPatternResult ──────────────────────────────────────────────────────

  describe('recordPatternResult', () => {
    it('creates a new entry on first record', () => {
      recordPatternResult('network:s1-game-1', 'reset_network', true, 5000);
      const patterns = getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toMatchObject({
        faultSig:      'network:s1-game-1',
        bestResponse:  'reset_network',
        successCount:  1,
        failureCount:  0,
        avgDurationMs: 5000,
      });
    });

    it('accumulates success and failure counts', () => {
      recordPatternResult('power:s1-game-1', 'restart_container', true,  10000);
      recordPatternResult('power:s1-game-1', 'restart_container', true,  20000);
      recordPatternResult('power:s1-game-1', 'restart_container', false, 30000);
      const p = getPatterns()[0];
      expect(p.successCount).toBe(2);
      expect(p.failureCount).toBe(1);
    });

    it('correctly rolling-averages duration', () => {
      recordPatternResult('code:s1', 'restart_container', true, 4000);
      recordPatternResult('code:s1', 'restart_container', true, 6000);
      expect(getPatterns()[0].avgDurationMs).toBe(5000);
    });

    it('updates bestResponse only on success', () => {
      recordPatternResult('endemic:s1', 'restart_container', false, 10000);
      recordPatternResult('endemic:s1', 'escalate',          true,   5000);
      expect(getPatterns()[0].bestResponse).toBe('escalate');
    });

    it('does not update bestResponse on failure', () => {
      recordPatternResult('network:s2', 'reset_network',     true,  5000);
      recordPatternResult('network:s2', 'restart_container', false, 10000);
      expect(getPatterns()[0].bestResponse).toBe('reset_network');
    });

    it('tracks separate patterns per faultSig', () => {
      recordPatternResult('network:s1', 'reset_network',     true, 4000);
      recordPatternResult('power:s2',   'restart_container', true, 8000);
      expect(getPatterns()).toHaveLength(2);
    });
  });

  // ── getPatterns ──────────────────────────────────────────────────────────────

  describe('getPatterns', () => {
    it('returns empty array when no patterns', () => {
      expect(getPatterns()).toEqual([]);
    });

    it('sorts by successCount descending', () => {
      recordPatternResult('power:s1',   'restart_container', true, 5000);
      recordPatternResult('power:s1',   'restart_container', true, 5000);  // 2 successes
      recordPatternResult('network:s1', 'reset_network',     true, 3000);  // 1 success
      const patterns = getPatterns();
      expect(patterns[0].faultSig).toBe('power:s1');
    });

    it('breaks ties by failureCount ascending', () => {
      recordPatternResult('a:node', 'reset_network',     true, 5000);
      recordPatternResult('b:node', 'restart_container', true, 5000);
      recordPatternResult('b:node', 'restart_container', false, 5000);  // b has more failures
      const patterns = getPatterns();
      expect(patterns[0].faultSig).toBe('a:node');
    });
  });

  // ── incident lifecycle ───────────────────────────────────────────────────────

  describe('incident lifecycle', () => {
    it('opens and closes an incident', () => {
      openIncident('inc-1', 's1-game-1', 'dead');
      closeIncident('inc-1', 'resolved', 15000,
        [{ action: 'reset_network', reason: 'test', ts: Date.now() }],
        'fixed', 'network',
      );
      const summary = getNodeIncidentSummary('s1-game-1');
      expect(summary.count).toBe(1);
      expect(summary.recent[0].outcome).toBe('resolved');
      expect(summary.recent[0].faultType).toBe('network');
    });

    it('ignores duplicate openIncident calls for the same id', () => {
      openIncident('inc-dup', 's1-game-2', 'dead');
      openIncident('inc-dup', 's1-game-2', 'dead');
      closeIncident('inc-dup', 'resolved', 5000, [], 'ok');
      // Only one incident should exist in the store
      const summary = getNodeIncidentSummary('s1-game-2');
      expect(summary.count).toBe(1);
    });

    it('open incidents do not appear in getNodeIncidentSummary (outcome null)', () => {
      openIncident('inc-open', 's2-game-1', 'dead');
      const summary = getNodeIncidentSummary('s2-game-1');
      expect(summary.count).toBe(0);
    });

    it('records escalated outcome', () => {
      openIncident('inc-esc', 's3-game-1', 'dead');
      closeIncident('inc-esc', 'escalated', 60000, [], 'hardware fault', 'endemic');
      const summary = getNodeIncidentSummary('s3-game-1');
      expect(summary.recent[0].outcome).toBe('escalated');
    });

    it('separates incidents by nodeId', () => {
      openIncident('inc-a', 's1-game-1', 'dead');
      closeIncident('inc-a', 'resolved', 5000, [], 'ok');
      openIncident('inc-b', 's2-game-1', 'dead');
      closeIncident('inc-b', 'resolved', 5000, [], 'ok');
      expect(getNodeIncidentSummary('s1-game-1').count).toBe(1);
      expect(getNodeIncidentSummary('s2-game-1').count).toBe(1);
      expect(getNodeIncidentSummary('s3-game-1').count).toBe(0);
    });
  });

  // ── playbook fast-path confidence gate ──────────────────────────────────────

  describe('confidence gate (≥3 successes, ≥80%)', () => {
    it('pattern meets confidence threshold at 3 successes and 100%', () => {
      for (let i = 0; i < 3; i++) {
        recordPatternResult('network:s1', 'reset_network', true, 5000);
      }
      const p = getPatterns()[0];
      expect(p.successCount).toBeGreaterThanOrEqual(3);
      expect(p.successCount / (p.successCount + p.failureCount)).toBeGreaterThanOrEqual(0.8);
    });

    it('pattern fails confidence threshold with 2 successes', () => {
      recordPatternResult('network:s1', 'reset_network', true, 5000);
      recordPatternResult('network:s1', 'reset_network', true, 5000);
      const p = getPatterns()[0];
      expect(p.successCount).toBeLessThan(3);
    });

    it('pattern fails confidence at <80% rate', () => {
      // 3 successes, 2 failures = 60%
      for (let i = 0; i < 3; i++) recordPatternResult('power:s1', 'restart_container', true, 5000);
      for (let i = 0; i < 2; i++) recordPatternResult('power:s1', 'restart_container', false, 5000);
      const p = getPatterns()[0];
      const rate = p.successCount / (p.successCount + p.failureCount);
      expect(rate).toBeLessThan(0.8);
    });
  });
});
