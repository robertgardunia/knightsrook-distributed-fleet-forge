export type AnimationType = 'chaos-shockwave' | 'fireman-pulse' | 'recovery-burst';

export interface NodeAnimation {
  type:       AnimationType;
  startedAt:  number;
  durationMs?: number; // undefined = persistent until explicitly cleared
}

const store       = new Map<string, NodeAnimation[]>();
const stressStore = new Map<string, number>();

export function getNodeStress(nodeId: string): number {
  return stressStore.get(nodeId) ?? 0;
}

export function setNodeStress(nodeId: string, level: number): void {
  stressStore.set(nodeId, level);
}

export function getAnimations(nodeId: string): NodeAnimation[] {
  const arr = store.get(nodeId);
  if (!arr) return [];
  // Prune expired timed entries on every read
  const now  = Date.now();
  const live = arr.filter(a => a.durationMs == null || (now - a.startedAt) < a.durationMs);
  if (live.length !== arr.length) store.set(nodeId, live);
  return live;
}

export function pushAnimation(nodeId: string, anim: NodeAnimation): void {
  const now  = Date.now();
  const live = (store.get(nodeId) ?? []).filter(
    a => a.durationMs == null || (now - a.startedAt) < a.durationMs
  );
  live.push(anim);
  store.set(nodeId, live);
}

export function clearType(nodeId: string, type: AnimationType): void {
  const arr = store.get(nodeId);
  if (!arr) return;
  store.set(nodeId, arr.filter(a => a.type !== type));
}

export function clearAll(): void {
  store.clear();
  stressStore.clear();
}

export function hasActiveAnimations(): boolean {
  const now = Date.now();
  for (const anims of store.values()) {
    if (anims.some(a => a.durationMs == null || (now - a.startedAt) < a.durationMs)) return true;
  }
  return false;
}
