import { createHash, randomBytes } from 'crypto';

// Produces a 16-char lowercase hex string — valid TSN seed format.
// Offline fallback when Moodle is unreachable; codes are queued for sync.
export function generateOfflineCode(kioskId: string): string {
  const entropy = randomBytes(8).toString('hex');
  return createHash('sha256')
    .update(`${kioskId}:${Date.now()}:${entropy}`)
    .digest('hex')
    .slice(0, 16);
}
