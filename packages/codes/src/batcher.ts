import { generateOfflineCode } from './codeGen.js';
import { OfflineQueue } from './offlineQueue.js';
import { generateCodes, claimCode, type MoodleConfig, type ClaimEntry } from './moodleClient.js';
import type { AccountObject } from './catcher.js';

export type { ClaimEntry };

export interface BatcherConfig {
  kioskId:   string;
  queuePath: string;          // file path for failed claim queue
  moodle:    MoodleConfig | null;  // null = always offline
}

export class CodeBatcher {
  private readonly config: BatcherConfig;
  private readonly queue:  OfflineQueue;

  constructor(config: BatcherConfig) {
    this.config = config;
    this.queue  = new OfflineQueue(config.queuePath);
  }

  // Returns a batch of account objects. Falls back to offline generation if Moodle is unreachable.
  // Offline codes carry empty event info — acceptable for testing, not for production.
  async getAccounts(count: number): Promise<AccountObject[]> {
    if (this.config.moodle) {
      try {
        return await generateCodes(this.config.moodle, count);
      } catch {
        // Moodle unreachable — fall through to offline generation
      }
    }
    return Array.from({ length: count }, () => ({
      code:      generateOfflineCode(this.config.kioskId),
      eventId:   '',
      eventName: '',
    }));
  }

  // Fire-and-forget: associate a code with collected data (email, etc.).
  // Queues locally if Moodle is unreachable — caller does not wait on the result.
  async claim(code: string, data: Record<string, unknown>): Promise<void> {
    const entry: ClaimEntry = { code, data };
    if (!this.config.moodle) {
      this.queue.push(entry);
      return;
    }
    try {
      await claimCode(this.config.moodle, entry);
    } catch {
      this.queue.push(entry);
    }
  }

  // Retry any queued claims. Called on Moodle reconnect.
  async sync(): Promise<void> {
    if (!this.config.moodle) return;
    const pending = this.queue.drain();
    if (pending.length === 0) return;
    const failed: ClaimEntry[] = [];
    for (const entry of pending) {
      try {
        await claimCode(this.config.moodle, entry);
      } catch {
        failed.push(entry);
      }
    }
    failed.forEach(e => this.queue.push(e));
  }

  pendingSync(): number { return this.queue.size(); }
}
