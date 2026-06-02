import type { XApiStatement } from './types.js';

export class XApiValidationError extends Error {
  constructor(public readonly field: string, detail: string) {
    super(`xAPI validation failed [${field}]: ${detail}`);
    this.name = 'XApiValidationError';
  }
}

function requireString(obj: Record<string, unknown>, field: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.trim() === '') throw new XApiValidationError(field, 'must be a non-empty string');
  return v;
}

function requireObject(obj: Record<string, unknown>, field: string): Record<string, unknown> {
  const v = obj[field];
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new XApiValidationError(field, 'must be an object');
  return v as Record<string, unknown>;
}

/**
 * Validates that `raw` is a well-formed XApiStatement.
 * Throws XApiValidationError describing the first offending field.
 * Call this at every tier boundary before queuing.
 */
export function validateStatement(raw: unknown): XApiStatement {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new XApiValidationError('root', 'statement must be a plain object');
  }
  const s = raw as Record<string, unknown>;

  requireString(s, 'id');
  requireString(s, 'timestamp');

  const actor = requireObject(s, 'actor');
  requireString(actor, 'name');
  requireString(actor, 'mbox');
  if (!String(actor['mbox']).startsWith('mailto:')) {
    throw new XApiValidationError('actor.mbox', 'must start with "mailto:"');
  }

  const authority = requireObject(s, 'authority');
  requireString(authority, 'name');
  requireString(authority, 'mbox');

  const verb = requireObject(s, 'verb');
  requireString(verb, 'id');
  const verbDisplay = requireObject(verb, 'display');
  requireString(verbDisplay, 'en-US');

  const obj = requireObject(s, 'object');
  requireString(obj, 'id');
  const def = requireObject(obj, 'definition');
  const defName = requireObject(def, 'name');
  requireString(defName, 'en-US');

  if (s['context'] !== undefined) {
    const ctx = requireObject(s, 'context');
    requireString(ctx, 'platform');
    if (typeof ctx['extensions'] !== 'object' || ctx['extensions'] === null) {
      throw new XApiValidationError('context.extensions', 'must be an object');
    }
  }

  return s as unknown as XApiStatement;
}
