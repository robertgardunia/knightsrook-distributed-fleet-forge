import { describe, it, expect } from 'vitest';
import { generateOfflineCode } from './codeGen.js';

describe('generateOfflineCode', () => {
  it('returns a 16-character string', () => {
    expect(generateOfflineCode('kiosk-1')).toHaveLength(16);
  });

  it('returns only lowercase hex characters', () => {
    const code = generateOfflineCode('kiosk-1');
    expect(code).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces unique codes on repeated calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOfflineCode('kiosk-1')));
    expect(codes.size).toBe(20);
  });

  it('produces unique codes across different kioskIds', () => {
    const a = generateOfflineCode('kiosk-1');
    const b = generateOfflineCode('kiosk-2');
    expect(a).not.toBe(b);
  });
});
