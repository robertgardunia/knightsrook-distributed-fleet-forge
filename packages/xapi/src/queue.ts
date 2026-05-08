import type { XApiStatement } from './types.js';

export interface Queue {
  push(stmt: XApiStatement): void;
  flush(emit: (stmt: XApiStatement) => void): void;
  size(): number;
}

/** In-memory queue — used by kiosk agents (lost on restart, acceptable for emulation). */
export class MemQueue implements Queue {
  private items: XApiStatement[] = [];

  push(stmt: XApiStatement): void { this.items.push(stmt); }

  flush(emit: (stmt: XApiStatement) => void): void {
    while (this.items.length > 0) emit(this.items.shift()!);
  }

  size(): number { return this.items.length; }
}
