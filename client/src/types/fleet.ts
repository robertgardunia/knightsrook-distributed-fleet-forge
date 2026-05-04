export type NodeStatus = 'federation' | 'island' | 'swarm' | 'dead';
export type NodeRole = 'homebase' | 'station-controller' | 'game-kiosk' | 'info-kiosk';

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
  isMock?: boolean;
}

export interface NodeStats {
  cpu: number;
  memUsed: number;
  memTotal: number;
  netInRate: number;
  netOutRate: number;
  uptime: number;
  processes: { pid: string; cmd: string }[];
}
