import type { CodeCaptureService } from '../codeCapture.js';

// Stub: physical card reader / HID barcode scanner integration goes here.
// When real hardware is present, open the device, listen for scan events,
// and call service.capture(code) for each read.
export function attachHardwareScanner(_service: CodeCaptureService): void {
  // not implemented — no hardware in virtual fleet
}
