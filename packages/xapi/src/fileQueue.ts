import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { XApiStatement } from './types.js';
import type { Queue } from './queue.js';

/** JSONL file-backed queue — used by station-controller (survives restarts). */
export class FileQueue implements Queue {
  constructor(private readonly path: string) {}

  push(stmt: XApiStatement): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, JSON.stringify(stmt) + '\n');
    } catch (err) {
      console.warn('[xapi/FileQueue] push failed:', err);
    }
  }

  flush(emit: (stmt: XApiStatement) => void): void {
    let contents: string;
    try { contents = readFileSync(this.path, 'utf8'); } catch { return; }

    const lines = contents.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;

    writeFileSync(this.path, '');
    let requeued = 0;
    for (const line of lines) {
      try {
        emit(JSON.parse(line) as XApiStatement);
      } catch {
        appendFileSync(this.path, line + '\n');
        requeued++;
      }
    }
    console.log(`[xapi/FileQueue] flushed ${lines.length - requeued}/${lines.length} statements`);
  }

  size(): number {
    try {
      return readFileSync(this.path, 'utf8').split('\n').filter(l => l.trim()).length;
    } catch { return 0; }
  }
}
