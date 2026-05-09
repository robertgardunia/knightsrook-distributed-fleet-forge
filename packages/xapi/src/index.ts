// Browser-safe exports — no Node.js built-ins
export type { XApiStatement, AuthMethod, NodeRole, AuthPathConfig, LrsConfig, TsnSeed } from './types.js';
export { AUTH_PATHS, getAuthConfig } from './authPaths.js';
export { FLEET_ORIGIN, ACTIVITY_BASE, VERBS, PLATFORM_MBOX, toMbox, isTsnSeed, buildStatement } from './statement.js';
export type { BuildStatementParams } from './statement.js';
export { MemQueue } from './queue.js';
export type { Queue } from './queue.js';
export { validateStatement, XApiValidationError } from './validate.js';

// Node.js-only — import from sub-paths when needed:
//   '@knightsrook/xapi/file-queue'  →  FileQueue
//   '@knightsrook/xapi/lrs-client'  →  createLrsClient
