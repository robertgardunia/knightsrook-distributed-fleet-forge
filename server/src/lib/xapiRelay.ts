import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const LL_ENDPOINT = process.env.LL_ENDPOINT;
const LL_KEY      = process.env.LL_KEY;
const LL_SECRET   = process.env.LL_SECRET;

const QUEUE_PATH = path.resolve(process.cwd(), 'data', 'xapi-queue.jsonl');

let lrsEnabled = false;

export function setLrsEnabled(val: boolean): void {
  lrsEnabled = val;
  console.log(`[xapiRelay] LRS posting ${val ? 'ENABLED' : 'DISABLED'}`);
}

export function getLrsStatus(): { enabled: boolean; queued: number } {
  return { enabled: lrsEnabled, queued: queueSize() };
}

function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${LL_KEY}:${LL_SECRET}`).toString('base64');
}

async function postToLrs(statements: unknown[]): Promise<boolean> {
  if (!LL_ENDPOINT || !LL_KEY || !LL_SECRET) {
    console.warn('[xapiRelay] LL_ENDPOINT/KEY/SECRET not configured — queuing');
    return false;
  }
  try {
    const res = await fetch(`${LL_ENDPOINT}/statements`, {
      method:  'POST',
      headers: {
        'Authorization':             basicAuth(),
        'Content-Type':              'application/json',
        'X-Experience-API-Version':  '1.0.3',
      },
      body: JSON.stringify(statements),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[xapiRelay] LRS ${res.status} — queuing (${body.slice(0, 120)})`);
      return false;
    }
    console.log(`[xapiRelay] posted ${statements.length} statement(s) to LRS`);
    return true;
  } catch (err) {
    console.warn('[xapiRelay] LRS unreachable — queuing:', String(err));
    return false;
  }
}

function enqueue(stmt: unknown): void {
  try {
    mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
    appendFileSync(QUEUE_PATH, JSON.stringify(stmt) + '\n');
  } catch (err) {
    console.warn('[xapiRelay] enqueue failed:', err);
  }
}

function queueSize(): number {
  try {
    return readFileSync(QUEUE_PATH, 'utf8').split('\n').filter(l => l.trim()).length;
  } catch { return 0; }
}

export async function flushQueue(): Promise<void> {
  if (!lrsEnabled) return;
  let contents: string;
  try { contents = readFileSync(QUEUE_PATH, 'utf8'); } catch { return; }

  const lines      = contents.split('\n').filter(l => l.trim());
  const statements = lines.flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
  if (statements.length === 0) return;

  const ok = await postToLrs(statements);
  if (ok) {
    writeFileSync(QUEUE_PATH, '');
    console.log(`[xapiRelay] flushed ${statements.length} queued statements`);
  }
}

export async function relay(stmt: unknown): Promise<void> {
  if (!lrsEnabled) {
    enqueue(stmt);
    return;
  }
  const ok = await postToLrs([stmt]);
  if (!ok) enqueue(stmt);
}
