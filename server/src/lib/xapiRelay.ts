import path from 'path';
import { createLrsClient } from '@knightsrook/xapi/lrs-client';
import { validateStatement, XApiValidationError } from '@knightsrook/xapi';

const client = createLrsClient({
  config: {
    endpoint: process.env.LL_ENDPOINT ?? '',
    key:      process.env.LL_KEY      ?? '',
    secret:   process.env.LL_SECRET   ?? '',
  },
  queuePath: path.resolve(process.cwd(), 'data', 'xapi-queue.jsonl'),
});

export async function relay(stmt: unknown): Promise<void> {
  try {
    const validated = validateStatement(stmt);
    return client.relay(validated);
  } catch (err) {
    if (err instanceof XApiValidationError) {
      console.warn('[xapiRelay] dropping invalid statement:', err.message);
      return;
    }
    throw err;
  }
}

export const flushQueue    = () => client.flush();
export const setLrsEnabled = (val: boolean) => client.setEnabled(val);
export const getLrsStatus  = () => client.getStatus();
