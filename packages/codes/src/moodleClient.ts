export interface MoodleConfig {
  endpoint: string;  // https://<host>/local/tsn_extauth/api.php
  apiKey:   string;
}

export interface ClaimEntry {
  code: string;
  data: Record<string, unknown>;
}

export async function generateCodes(
  config: MoodleConfig,
  count:  number,
): Promise<string[]> {
  const url = `${config.endpoint}?action=generate&role=student&count=${count}`;
  const res  = await fetch(url, { method: 'POST', headers: { 'X-Api-Key': config.apiKey } });
  const body = await res.json() as { ok: boolean; codes: string[] };
  if (!body.ok) throw new Error(`generate failed (${res.status})`);
  return body.codes;
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
