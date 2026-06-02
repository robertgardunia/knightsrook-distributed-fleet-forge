import { EventEmitter } from 'events';

export interface AccountObject {
  code:      string;
  eventId:   string;
  eventName: string;
}

export class CodeCaptureService extends EventEmitter {
  private active: AccountObject | null = null;

  capture(payload: string): void {
    const trimmed = payload.trim();
    if (!trimmed) return;

    let account: AccountObject;
    try {
      const parsed = JSON.parse(trimmed) as Partial<AccountObject>;
      account = {
        code:      parsed.code      ?? trimmed,
        eventId:   parsed.eventId   ?? '',
        eventName: parsed.eventName ?? '',
      };
    } catch {
      account = { code: trimmed, eventId: '', eventName: '' };
    }

    this.active = account;
    this.emit('user:identified', account);
  }

  clear(): void {
    if (!this.active) return;
    this.active = null;
    this.emit('user:cleared');
  }

  current(): AccountObject | null {
    return this.active;
  }
}
