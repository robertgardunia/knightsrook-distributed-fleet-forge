import type { FleetGraph, FleetNode, FleetLink } from './mockFleet.js';

type NodeStatus = 'federation' | 'island' | 'swarm' | 'dead';
type NodeRole   = 'homebase' | 'station-controller' | 'game-kiosk' | 'info-kiosk';

const STATUS_COLOR: Record<NodeStatus, string> = {
  federation: '#4ade80',
  island:     '#facc15',
  swarm:      '#fb923c',
  dead:       '#f87171',
};

const NODE_SIZE: Record<NodeRole, number> = {
  'homebase':            20,
  'station-controller':  8,
  'game-kiosk':          3,
  'info-kiosk':          3,
};

const HEARTBEAT_TIMEOUT_MS = 15_000;
const ALERT_THRESHOLD_MS   =  9_000;

interface AgentRecord {
  id:       string;
  name:     string;
  role:     NodeRole;
  parentId: string | null;
  lastSeen: number;
  status:   NodeStatus;
  alerting: boolean;
}

export class FleetRegistry {
  private agents = new Map<string, AgentRecord>();
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    setInterval(() => this.checkTimeouts(), 5_000);
  }

  register(data: { id: string; name: string; role: string; parentId?: string | null }) {
    const existing = this.agents.get(data.id);
    this.agents.set(data.id, {
      id:       data.id,
      name:     data.name,
      role:     data.role as NodeRole,
      parentId: data.parentId ?? null,
      lastSeen: Date.now(),
      status:   existing?.status ?? 'federation',
      alerting: false,
    });
    console.log(`[registry] registered ${data.id} (${data.role})`);
    this.onChange();
  }

  heartbeat(id: string) {
    const agent = this.agents.get(id);
    if (!agent) return;
    const wasDead     = agent.status === 'dead';
    const wasAlerting = agent.alerting;
    agent.lastSeen = Date.now();
    agent.alerting = false;
    if (wasDead) {
      agent.status = 'federation';
      console.log(`[registry] ${id} recovered`);
      this.onChange();
    } else if (wasAlerting) {
      this.onChange();
    }
  }

  unregister(id: string) {
    if (this.agents.delete(id)) {
      console.log(`[registry] unregistered ${id}`);
      this.onChange();
    }
  }

  get size() { return this.agents.size; }

  clear() {
    this.agents.clear();
    this.onChange();
  }

  buildGraph(): FleetGraph {
    const nodes: FleetNode[] = [{
      id:     'homebase',
      name:   'Home',
      role:   'homebase',
      status: 'federation',
      val:    NODE_SIZE['homebase'],
      color:  STATUS_COLOR['federation'],
    }];
    const links: FleetLink[] = [];

    for (const agent of this.agents.values()) {
      nodes.push({
        id:       agent.id,
        name:     agent.name,
        role:     agent.role,
        status:   agent.status,
        val:      NODE_SIZE[agent.role] ?? 3,
        color:    STATUS_COLOR[agent.status],
        alerting: agent.alerting || undefined,
      });
      const parent = agent.parentId ?? 'homebase';
      links.push({ source: parent, target: agent.id });
    }

    return { nodes, links };
  }

  private checkTimeouts() {
    const now = Date.now();
    let changed = false;
    for (const agent of this.agents.values()) {
      const age = now - agent.lastSeen;
      if (agent.status !== 'dead' && age > HEARTBEAT_TIMEOUT_MS) {
        agent.status   = 'dead';
        agent.alerting = false;
        console.log(`[registry] ${agent.id} timed out → dead`);
        changed = true;
      } else if (agent.status !== 'dead' && age > ALERT_THRESHOLD_MS && !agent.alerting) {
        agent.alerting = true;
        changed = true;
      }
    }
    if (changed) this.onChange();
  }
}
