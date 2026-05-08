import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const QUEUE_PATH = path.resolve(process.cwd(), 'data', 'xapi-queue.jsonl');

export interface XApiStatement {
  id:        string;
  actor:     { objectType: 'Agent'; name: string; mbox: string };
  authority: { objectType: 'Agent'; name: string; mbox: string };
  verb:      { id: string; display: { 'en-US': string } };
  object:    { objectType: 'Activity'; id: string; definition: { name: { 'en-US': string } } };
  timestamp: string;
  context:   { platform: string; extensions: Record<string, unknown> };
}

export function enqueue(stmt: XApiStatement): void {
  try {
    mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
    appendFileSync(QUEUE_PATH, JSON.stringify(stmt) + '\n');
  } catch (err) {
    console.warn('[xapiQueue] enqueue failed:', err);
  }
}

export function flush(emit: (stmt: XApiStatement) => void): void {
  let contents: string;
  try { contents = readFileSync(QUEUE_PATH, 'utf8'); } catch { return; }

  const lines = contents.split('\n').filter(l => l.trim());
  if (lines.length === 0) return;

  writeFileSync(QUEUE_PATH, '');
  let requeued = 0;
  for (const line of lines) {
    try {
      emit(JSON.parse(line) as XApiStatement);
    } catch {
      appendFileSync(QUEUE_PATH, line + '\n');
      requeued++;
    }
  }
  console.log(`[xapiQueue] flushed ${lines.length - requeued}/${lines.length} statements`);
}

export function size(): number {
  try {
    return readFileSync(QUEUE_PATH, 'utf8').split('\n').filter(l => l.trim()).length;
  } catch { return 0; }
}
