import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

export interface Network {
  id:          string;
  name:        string;
  composeFile: string;
}

// Swap JsonNetworkStore for a DB-backed implementation here when ready.
// When migrating: server/config/networks.json becomes the migration seed;
// activeId moves to a settings table.
export interface NetworkStore {
  list():                 Network[];
  get(id: string):        Network | undefined;
  getActive():            Network;
  setActive(id: string): void;
}

export class JsonNetworkStore implements NetworkStore {
  private readonly networks:    Network[];
  private readonly activeFile:  string;
  private activeId:             string;

  constructor(configFile: string, activeFile: string) {
    this.networks   = JSON.parse(readFileSync(configFile, 'utf8')) as Network[];
    this.activeFile = activeFile;
    this.activeId   = existsSync(activeFile)
      ? (JSON.parse(readFileSync(activeFile, 'utf8')) as { activeId: string }).activeId
      : this.networks[0].id;
  }

  list(): Network[] { return this.networks; }

  get(id: string): Network | undefined {
    return this.networks.find(n => n.id === id);
  }

  getActive(): Network {
    return this.get(this.activeId) ?? this.networks[0];
  }

  setActive(id: string): void {
    if (!this.get(id)) throw new Error(`Unknown network id: ${id}`);
    this.activeId = id;
    writeFileSync(this.activeFile, JSON.stringify({ activeId: id }), 'utf8');
  }
}

export function createNetworkStore(): NetworkStore {
  const configFile = path.resolve(process.cwd(), 'config', 'networks.json');
  const activeFile = path.resolve(process.cwd(), 'data', 'active-network.json');
  return new JsonNetworkStore(configFile, activeFile);
}
