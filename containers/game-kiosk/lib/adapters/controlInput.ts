import type { Socket } from 'socket.io-client';
import type { CodeCaptureService } from '../codeCapture.js';

// Wires the monitoring control flow (kiosk:scan from operator) into the
// code capture service. Same code path as hardware — adapter only.
export function attachControlInput(
  service: CodeCaptureService,
  socket:  Socket,
  agentId: string,
): void {
  socket.on('kiosk:scan', ({ nodeId, data }: { nodeId: string; data: string }) => {
    if (nodeId !== agentId) return;
    service.capture(data);
  });
}
