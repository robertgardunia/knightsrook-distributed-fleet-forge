import { generateOfflineCode } from './codeGen.js';
import { OfflineQueue } from './offlineQueue.js';
import { requestAccounts, syncOfflineAccounts, type MoodleConfig, type PendingAccount } from './moodleClient.js';

export type { PendingAccount };

export interface BatcherConfig {
  kioskId:   string;
  queuePath: string;           // file path for offline sync queue
  moodle:    MoodleConfig | null;  // null = always offline
}

export class CodeBatcher {
  private readonly config: BatcherConfig;
  private readonly queue:  OfflineQueue;

  constructor(config: BatcherConfig) {
    this.config = config;
    this.queue  = new OfflineQueue(config.queuePath);
  }

  // Returns pending accounts. Each account's code is the temp LRS identity.
  // email/name (when present) are used by Moodle to email the code to the user
  // and by the LRS updater to reconcile xAPI records to the real account later.
  async getAccounts(count: number): Promise<PendingAccount[]> {
    if (this.config.moodle) {
      try {
        return await requestAccounts(this.config.moodle, this.config.kioskId, count);
      } catch {
        // Moodle unreachable — fall through to offline generation
      }
    }
    const accounts: PendingAccount[] = [];
    for (let i = 0; i < count; i++) {
      const code = generateOfflineCode(this.config.kioskId);
      accounts.push({ code, email: null, name: null });
      this.queue.push({ code, kioskId: this.config.kioskId, generatedAt: Date.now(), email: null, name: null });
    }
    return accounts;
  }

  async sync(): Promise<void> {
    if (!this.config.moodle) return;
    const pending = this.queue.drain();
    if (pending.length === 0) return;
    try {
      await syncOfflineAccounts(this.config.moodle, pending);
    } catch {
      // Put them back — sync will retry next time
      pending.forEach(e => this.queue.push(e));
    }
  }

  pendingSync(): number { return this.queue.size(); }
}
