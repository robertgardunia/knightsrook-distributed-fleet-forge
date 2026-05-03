type NodeStatus = 'federation' | 'island' | 'swarm' | 'dead';
type NodeRole = 'homebase' | 'station-controller' | 'game-kiosk' | 'info-kiosk';

export interface FleetNode {
  id: string;
  name: string;
  role: NodeRole;
  status: NodeStatus;
  val: number;
  color: string;
}

export interface FleetLink {
  source: string;
  target: string;
}

export interface FleetGraph {
  nodes: FleetNode[];
  links: FleetLink[];
}

const STATUS_COLOR: Record<NodeStatus, string> = {
  federation: '#4ade80',
  island:     '#facc15',
  swarm:      '#fb923c',
  dead:       '#f87171',
};

const NODE_SIZE: Record<NodeRole, number> = {
  homebase:              20,
  'station-controller':  8,
  'game-kiosk':          3,
  'info-kiosk':          3,
};

export function buildMockFleet(stationCount = 6): FleetGraph {
  const nodes: FleetNode[] = [];
  const links: FleetLink[] = [];

  nodes.push({
    id: 'homebase',
    name: 'Home',
    role: 'homebase',
    status: 'federation',
    val: NODE_SIZE['homebase'],
    color: STATUS_COLOR['federation'],
  });

  for (let s = 1; s <= stationCount; s++) {
    const stationId = `station-${s}`;
    nodes.push({
      id: stationId,
      name: `S${s}`,
      role: 'station-controller',
      status: 'federation',
      val: NODE_SIZE['station-controller'],
      color: STATUS_COLOR['federation'],
    });
    links.push({ source: 'homebase', target: stationId });

    for (let k = 1; k <= 3; k++) {
      const kioskId = `${stationId}-game-${k}`;
      nodes.push({
        id: kioskId,
        name: `KG${k}`,
        role: 'game-kiosk',
        status: 'federation',
        val: NODE_SIZE['game-kiosk'],
        color: STATUS_COLOR['federation'],
      });
      links.push({ source: stationId, target: kioskId });
    }

    const infoId = `${stationId}-info`;
    nodes.push({
      id: infoId,
      name: 'KI1',
      role: 'info-kiosk',
      status: 'federation',
      val: NODE_SIZE['info-kiosk'],
      color: STATUS_COLOR['federation'],
    });
    links.push({ source: stationId, target: infoId });
  }

  return { nodes, links };
}
