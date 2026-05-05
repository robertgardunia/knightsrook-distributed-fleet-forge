import type { Server } from 'socket.io';
import type { FleetRegistry } from './fleetRegistry.js';
import { getHistory } from './telemetry.js';
import { runFireman } from './fireman.js';

// Only spawn on 'dead' — 'alerting' is a warning, not yet needing a Fireman
const TRIGGER_EVENTS = new Set(['dead']);

// Nodes that never need a Fireman spawned
const IGNORED_NODES = new Set(['homebase', 'chaos-agent', 'fireman']);

export class Dispatcher {
  private active = new Map<string, string>(); // nodeId → incidentId

  constructor(
    private registry: FleetRegistry,
    private io: Server,
  ) {}

  handleEvent(nodeId: string, event: string): void {
    if (!TRIGGER_EVENTS.has(event))         return;
    if (IGNORED_NODES.has(nodeId))          return;
    if (this.active.has(nodeId))            return; // already being worked

    const incidentId = `${nodeId}-${Date.now()}`;
    this.active.set(nodeId, incidentId);

    this.spawn(incidentId, nodeId, event)
      .catch(err => console.error(`[DISPATCHER] ${incidentId} uncaught:`, err))
      .finally(() => this.active.delete(nodeId));
  }

  private async spawn(incidentId: string, nodeId: string, event: string): Promise<void> {
    const telemetry     = getHistory(nodeId);
    const fleetSnapshot = this.registry.buildGraph();

    await runFireman({
      incidentId,
      nodeId,
      event,
      telemetry,
      fleetSnapshot,
      getNodeStatus: (id) => {
        const node = this.registry.buildGraph().nodes.find(n => n.id === id);
        if (!node)                return 'unknown';
        if (node.status === 'dead')  return 'dead';
        if (node.alerting)           return 'alerting';
        return 'alive';
      },
      emit: (ev, data) => this.io.emit(ev, data),
    });
  }

  get activeCount(): number { return this.active.size; }
}
