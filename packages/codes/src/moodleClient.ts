import type { AccountObject } from './catcher.js';

export interface MoodleConfig {
  endpoint:  string;  // https://<host>/local/tsn_extauth/api.php
  apiKey:    string;
  eventCode: string;
  eventName: string;
}

export interface ClaimEntry {
  code: string;
  data: Record<string, unknown>;
}

export async function generateCodes(
  config: MoodleConfig,
  count:  number,
): Promise<AccountObject[]> {
  const params = new URLSearchParams({
    action:     'generate',
    role:       'student',
    count:      String(count),
    event_code: config.eventCode,
    event_name: config.eventName,
  });
  const res  = await fetch(`${config.endpoint}?${params}`, { method: 'POST', headers: { 'X-Api-Key': config.apiKey } });
  const body = await res.json() as { ok: boolean; accounts: Array<{ code: string; event_id: string; event_name: string }> };
  if (!body.ok) throw new Error(`generate failed (${res.status})`);
  return body.accounts.map(a => ({ code: a.code, eventId: a.event_id, eventName: a.event_name }));
}

// Fire-and-forget — throws on network error so caller can queue.
export async function claimCode(
  config: MoodleConfig,
  entry:  ClaimEntry,
): Promise<void> {
  const res  = await fetch(`${config.endpoint}?action=claim_code`, {
    method:  'POST',
    headers: { 'X-Api-Key': config.apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify(entry),
  });
  const body = await res.json() as { ok: boolean };
  if (!body.ok) console.warn('[batcher] claim_code nack:', entry.code, res.status);
}
