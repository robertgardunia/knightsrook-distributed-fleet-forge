import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { ClaimEntry } from './moodleClient.js';

// File-backed queue of pending claim_code calls that failed or couldn't reach Moodle.
// Survives process restarts — same pattern as @knightsrook/xapi FileQueue.
export class OfflineQueue {
  private entries: ClaimEntry[] = [];
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    if (existsSync(path)) {
      try {
        this.entries = JSON.parse(readFileSync(path, 'utf8')) as ClaimEntry[];
      } catch { this.entries = []; }
    }
  }

  push(entry: ClaimEntry): void {
    this.entries.push(entry);
    this.persist();
  }

  drain(): ClaimEntry[] {
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
