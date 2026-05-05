export type AnimationType = 'chaos-shockwave' | 'fireman-pulse' | 'recovery-burst';

export interface NodeAnimation {
  type:       AnimationType;
  startedAt:  number;
  durationMs?: number; // undefined = persistent until explicitly cleared
}

const store = new Map<string, NodeAnimation[]>();

export function getAnimations(nodeId: string): NodeAnimation[] {
  return store.get(nodeId) ?? [];
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
