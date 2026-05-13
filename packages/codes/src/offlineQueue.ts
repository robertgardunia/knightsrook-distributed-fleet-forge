import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { OfflineSyncEntry } from './moodleClient.js';

// File-backed queue of offline-generated codes pending Moodle sync.
// Survives process restarts — same pattern as @knightsrook/xapi FileQueue.
export class OfflineQueue {
  private entries: OfflineSyncEntry[] = [];
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    if (existsSync(path)) {
      try {
        this.entries = JSON.parse(readFileSync(path, 'utf8')) as OfflineSyncEntry[];
      } catch { this.entries = []; }
    }
  }

  push(entry: OfflineSyncEntry): void {
    this.entries.push(entry);
    this.persist();
  }

  drain(): OfflineSyncEntry[] {
    const all = [...this.entries];
    this.entries = [];
    this.persist();
    return all;
  }

  size(): number { return this.entries.length; }

  private persist(): void {
    writeFileSync(this.path, JSON.stringify(this.entries), 'utf8');
  }
}
