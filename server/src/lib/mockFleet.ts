type NodeStatus = 'federation' | 'island' | 'swarm' | 'dead';
type NodeRole = 'homebase' | 'station-controller' | 'game-kiosk' | 'info-kiosk';

export interface FleetNode {
  id: string;
  name: string;
  role: NodeRole;
  status: NodeStatus;
  val: number;
  color: string;
  location?: string;
  alerting?: boolean;
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

// Each station has its own venue name and kiosk counts — intentionally varied
// so the demo fleet graph looks like a real multi-venue deployment, not a clone army.
const STATIONS = [
  { venue: 'Main Hall',        gameKiosks: 5, infoKiosks: 2 }, // flagship — largest
  { venue: 'East Pavilion',    gameKiosks: 4, infoKiosks: 3 }, // info-heavy
  { venue: 'West Wing',        gameKiosks: 3, infoKiosks: 1 }, // compact
  { venue: 'North Atrium',     gameKiosks: 6, infoKiosks: 1 }, // game-heavy
  { venue: 'South Concourse',  gameKiosks: 4, infoKiosks: 2 }, // standard
];

export function buildMockFleet(): FleetGraph {
  const nodes: FleetNode[] = [];
  const links: FleetLink[] = [];

  nodes.push({
    id: 'homebase',
    name: 'Home',
    role: 'homebase',
    status: 'federation',
    val: NODE_SIZE['homebase'],
    color: STATUS_COLOR['federation'],
    location: 'Operations Center',
  });

  STATIONS.forEach((cfg, idx) => {
    const s = idx + 1;
    const stationId = `station-${s}`;
    nodes.push({
      id: stationId,
      name: `S${s}`,
      role: 'station-controller',
      status: 'federation',
      val: NODE_SIZE['station-controller'],
      color: STATUS_COLOR['federation'],
      location: cfg.venue,
    });
    links.push({ source: 'homebase', target: stationId });

    for (let k = 1; k <= cfg.gameKiosks; k++) {
      nodes.push({
        id: `${stationId}-game-${k}`,
        name: `KG${k}`,
        role: 'game-kiosk',
        status: 'federation',
        val: NODE_SIZE['game-kiosk'],
        color: STATUS_COLOR['federation'],
        location: `${cfg.venue} · Bay G${k}`,
      });
      links.push({ source: stationId, target: `${stationId}-game-${k}` });
    }

    for (let i = 1; i <= cfg.infoKiosks; i++) {
      nodes.push({
        id: `${stationId}-info-${i}`,
        name: `KI${i}`,
        role: 'info-kiosk',
        status: 'federation',
        val: NODE_SIZE['info-kiosk'],
        color: STATUS_COLOR['federation'],
        location: `${cfg.venue} · Bay I${i}`,
      });
      links.push({ source: stationId, target: `${stationId}-info-${i}` });
    }
  });

  return { nodes, links };
}
