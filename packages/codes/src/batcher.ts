import { generateOfflineCode } from './codeGen.js';
import { OfflineQueue } from './offlineQueue.js';
import { requestCodes, syncOfflineCodes, type MoodleConfig } from './moodleClient.js';

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

  async getCodes(count: number): Promise<string[]> {
    if (this.config.moodle) {
      try {
        return await requestCodes(this.config.moodle, this.config.kioskId, count);
      } catch {
        // Moodle unreachable — fall through to offline generation
      }
    }
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = generateOfflineCode(this.config.kioskId);
      codes.push(code);
      this.queue.push({ code, kioskId: this.config.kioskId, generatedAt: Date.now() });
    }
    return codes;
  }

  async sync(): Promise<void> {
    if (!this.config.moodle) return;
    const pending = this.queue.drain();
    if (pending.length === 0) return;
    try {
      await syncOfflineCodes(this.config.moodle, pending);
    } catch {
      // Put them back — sync will retry next time
      pending.forEach(e => this.queue.push(e));
    }
  }

  pendingSync(): number { return this.queue.size(); }
}
