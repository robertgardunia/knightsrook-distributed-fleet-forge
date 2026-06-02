// Main export — catcher types (Node.js safe).
// Node.js-only batcher code is behind sub-path:
//   '@knightsrook/codes/catcher'  →  CodeCaptureService
//   '@knightsrook/codes/batcher'  →  CodeBatcher
export { CodeCaptureService, type AccountObject } from './catcher.js';
export { generateOfflineCode } from './codeGen.js';
