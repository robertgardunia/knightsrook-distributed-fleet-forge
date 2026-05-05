const BASE = process.env.TOXIPROXY_URL ?? 'http://chaos-proxy:8474';

interface ToxicAttributes {
  latency?: number;
  jitter?: number;
  rate?: number;
  percent?: number;
  timeout?: number;
}

interface Toxic {
  name: string;
  type: string;
  stream?: string;
  toxicity?: number;
  attributes: ToxicAttributes;
}

export async function listToxics(proxy: string): Promise<Toxic[]> {
  const res = await fetch(`${BASE}/proxies/${proxy}/toxics`);
  if (!res.ok) throw new Error(`listToxics ${proxy}: ${res.status}`);
  return res.json() as Promise<Toxic[]>;
}

export async function addToxic(proxy: string, toxic: Toxic): Promise<void> {
  const res = await fetch(`${BASE}/proxies/${proxy}/toxics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toxic),
  });
  if (!res.ok) throw new Error(`addToxic ${proxy}/${toxic.name}: ${res.status} ${await res.text()}`);
}

export async function removeToxic(proxy: string, toxicName: string): Promise<void> {
  const res = await fetch(`${BASE}/proxies/${proxy}/toxics/${toxicName}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`removeToxic ${proxy}/${toxicName}: ${res.status}`);
}

export async function resetProxy(proxy: string): Promise<void> {
  const toxics = await listToxics(proxy);
  await Promise.all(toxics.map(t => removeToxic(proxy, t.name)));
}
