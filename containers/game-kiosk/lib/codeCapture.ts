import { EventEmitter } from 'events';

export class CodeCaptureService extends EventEmitter {
  private activeCode: string | null = null;

  capture(code: string): void {
    const trimmed = code.trim();
    if (!trimmed) return;
    this.activeCode = trimmed;
    this.emit('user:identified', trimmed);
  }

  clear(): void {
    if (!this.activeCode) return;
    this.activeCode = null;
    this.emit('user:cleared');
  }

  current(): string | null {
    return this.activeCode;
  }
}
