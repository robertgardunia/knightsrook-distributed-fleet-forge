import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { LrsConfig, XApiStatement } from './types.js';

function basicAuth(cfg: LrsConfig): string {
  return 'Basic ' + Buffer.from(`${cfg.key}:${cfg.secret}`).toString('base64');
}

async function postToLrs(statements: unknown[], cfg: LrsConfig): Promise<boolean> {
  if (!cfg.endpoint || !cfg.key || !cfg.secret) {
    console.warn('[xapi/lrsClient] LRS credentials not configured — queuing');
    return false;
  }
  try {
    const res = await fetch(`${cfg.endpoint}/statements`, {
      method:  'POST',
      headers: {
        'Authorization':            basicAuth(cfg),
        'Content-Type':             'application/json',
        'X-Experience-API-Version': '1.0.3',
      },
      body: JSON.stringify(statements),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[xapi/lrsClient] LRS ${res.status} — queuing (${body.slice(0, 120)})`);
      return false;
    }
    console.log(`[xapi/lrsClient] posted ${statements.length} statement(s) to LRS`);
    return true;
  } catch (err) {
    console.warn('[xapi/lrsClient] LRS unreachable — queuing:', String(err));
    return false;
  }
}

export interface LrsClientOptions {
  config:    LrsConfig;
  queuePath: string;
}

export interface LrsClient {
  relay(stmt: XApiStatement): Promise<void>;
  flush(): Promise<void>;
  setEnabled(val: boolean): void;
  getStatus(): { enabled: boolean; queued: number };
}

export function createLrsClient({ config, queuePath }: LrsClientOptions): LrsClient {
  let enabled = false;

  function enqueue(stmt: unknown): void {
    try {
      mkdirSync(dirname(queuePath), { recursive: true });
      appendFileSync(queuePath, JSON.stringify(stmt) + '\n');
    } catch (err) {
      console.warn('[xapi/lrsClient] enqueue failed:', err);
    }
  }

  function queueSize(): number {
    try {
      return readFileSync(queuePath, 'utf8').split('\n').filter(l => l.trim()).length;
    } catch { return 0; }
  }

  async function flush(): Promise<void> {
    if (!enabled) return;
    let contents: string;
    try { contents = readFileSync(queuePath, 'utf8'); } catch { return; }

    const lines      = contents.split('\n').filter(l => l.trim());
    const statements = lines.flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
    if (statements.length === 0) return;

    const ok = await postToLrs(statements, config);
    if (ok) {
      writeFileSync(queuePath, '');
      console.log(`[xapi/lrsClient] flushed ${statements.length} queued statements`);
    }
  }

  async function relay(stmt: XApiStatement): Promise<void> {
    if (!enabled) { enqueue(stmt); return; }
    const ok = await postToLrs([stmt], config);
    if (!ok) enqueue(stmt);
  }

  return {
    relay,
    flush,
    setEnabled: (val) => { enabled = val; },
    getStatus:  () => ({ enabled, queued: queueSize() }),
  };
}
