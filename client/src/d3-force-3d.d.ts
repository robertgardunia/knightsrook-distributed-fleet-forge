declare module 'd3-force-3d' {
  export function forceCollide<T>(radius: number | ((node: T) => number)): {
    strength(s: number): this;
  };
}
