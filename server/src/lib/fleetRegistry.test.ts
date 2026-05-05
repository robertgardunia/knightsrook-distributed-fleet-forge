import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FleetRegistry } from './fleetRegistry.js';

const ALERT_MS   =  9_000;
const DEAD_MS    = 15_000;
const INTERVAL   =  5_000;

function makeRegistry(onChange = vi.fn(), onEvent = vi.fn()) {
  return { registry: new FleetRegistry(onChange, onEvent), onChange, onEvent };
}

describe('FleetRegistry', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('register() adds a node and fires onChange + register event', () => {
    const { registry, onChange, onEvent } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith('n1', 'register');
  });

  it('buildGraph() includes registered node', () => {
    const { registry } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    const graph = registry.buildGraph();
    expect(graph.nodes.some(n => n.id === 'n1')).toBe(true);
  });

  it('register() preserves status on re-registration', () => {
    const { registry } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    // Force dead state manually via timeout
    vi.advanceTimersByTime(DEAD_MS + INTERVAL);
    expect(registry.buildGraph().nodes.find(n => n.id === 'n1')?.status).toBe('dead');
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    expect(registry.buildGraph().nodes.find(n => n.id === 'n1')?.status).toBe('dead');
  });

  it('heartbeat() prevents alerting', () => {
    const { registry } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    vi.advanceTimersByTime(ALERT_MS - 1);
    registry.heartbeat('n1');
    vi.advanceTimersByTime(INTERVAL);
    const node = registry.buildGraph().nodes.find(n => n.id === 'n1');
    expect(node?.alerting).toBeFalsy();
    expect(node?.status).toBe('federation');
  });

  it('marks node alerting after 9s silence', () => {
    const { registry, onEvent } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    vi.advanceTimersByTime(ALERT_MS + INTERVAL);
    const node = registry.buildGraph().nodes.find(n => n.id === 'n1');
    expect(node?.alerting).toBe(true);
    expect(onEvent).toHaveBeenCalledWith('n1', 'alerting');
  });

  it('marks node dead after 15s silence', () => {
    const { registry, onEvent } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    vi.advanceTimersByTime(DEAD_MS + INTERVAL);
    const node = registry.buildGraph().nodes.find(n => n.id === 'n1');
    expect(node?.status).toBe('dead');
    expect(onEvent).toHaveBeenCalledWith('n1', 'dead');
  });

  it('heartbeat() recovers a dead node and fires recovered event', () => {
    const { registry, onEvent } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    vi.advanceTimersByTime(DEAD_MS + INTERVAL);
    expect(registry.buildGraph().nodes.find(n => n.id === 'n1')?.status).toBe('dead');
    registry.heartbeat('n1');
    expect(registry.buildGraph().nodes.find(n => n.id === 'n1')?.status).toBe('federation');
    expect(onEvent).toHaveBeenCalledWith('n1', 'recovered');
  });

  it('unregister() removes the node', () => {
    const { registry } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    registry.unregister('n1');
    expect(registry.buildGraph().nodes.some(n => n.id === 'n1')).toBe(false);
  });

  it('alerting fires only once per silence window', () => {
    const { registry, onEvent } = makeRegistry();
    registry.register({ id: 'n1', name: 'N1', role: 'game-kiosk' });
    vi.advanceTimersByTime(DEAD_MS + INTERVAL * 3);
    const alertingCalls = onEvent.mock.calls.filter(c => c[1] === 'alerting').length;
    expect(alertingCalls).toBe(1);
  });
});
