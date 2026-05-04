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

interface AgentRecord {
  id:       string;
  name:     string;
  role:     NodeRole;
  parentId: string | null;
  lastSeen: number;
  status:   NodeStatus;
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
    });
    console.log(`[registry] registered ${data.id} (${data.role})`);
    this.onChange();
  }

  heartbeat(id: string) {
    const agent = this.agents.get(id);
    if (!agent) return;
    const wasDead = agent.status === 'dead';
    agent.lastSeen = Date.now();
    if (wasDead) {
      agent.status = 'federation';
      console.log(`[registry] ${id} recovered`);
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
        id:     agent.id,
        name:   agent.name,
        role:   agent.role,
        status: agent.status,
        val:    NODE_SIZE[agent.role] ?? 3,
        color:  STATUS_COLOR[agent.status],
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
      if (agent.status !== 'dead' && now - agent.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        agent.status = 'dead';
        console.log(`[registry] ${agent.id} timed out → dead`);
        changed = true;
      }
    }
    if (changed) this.onChange();
  }
}
