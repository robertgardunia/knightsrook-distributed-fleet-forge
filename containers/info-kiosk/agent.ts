import { io } from 'socket.io-client';
import { buildStatement, MemQueue, ACTIVITY_BASE } from '@knightsrook/xapi';

const AGENT_ID     = process.env.AGENT_ID!;
const AGENT_NAME   = process.env.AGENT_NAME!;
const AGENT_ROLE   = process.env.AGENT_ROLE!;
const AGENT_PARENT = process.env.AGENT_PARENT ?? null;
const HOMEBASE_URL = process.env.HOMEBASE_URL ?? 'http://localhost:5020';
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 5000);

if (!AGENT_ID || !AGENT_NAME || !AGENT_ROLE) {
  console.error('AGENT_ID, AGENT_NAME, and AGENT_ROLE are required');
  process.exit(1);
}

const socket = io(HOMEBASE_URL, { reconnectionDelay: 2000, reconnectionDelayMax: 10000 });

socket.on('connect', () => {
  console.log(`[${AGENT_ID}] connected to homebase`);
  socket.emit('agent:register', { id: AGENT_ID, name: AGENT_NAME, role: AGENT_ROLE, parentId: AGENT_PARENT });
  if (lrsEnabled) {
    xapiQueue.flush(s => socket.emit('xapi:statement', s));
  }
});

socket.on('disconnect', (reason) => {
  console.log(`[${AGENT_ID}] disconnected: ${reason}`);
});

socket.on('connect_error', (err) => {
  console.log(`[${AGENT_ID}] connect error: ${err.message} — retrying…`);
});

setInterval(() => {
  if (socket.connected) socket.emit('agent:heartbeat', { id: AGENT_ID });
}, HEARTBEAT_MS);

// ── xAPI queue ───────────────────────────────────────────────────────────────

const xapiQueue = new MemQueue();

function xapi(
  actorName: string,
  actorId:   string,
  verbKey:   string,
  objectId:  string,
  label:     string,
  ext:       Record<string, unknown> = {},
): void {
  if (!emulating) return;
  const stmt = buildStatement({ actorName, actorId, verbKey, objectId, label, nodeId: AGENT_ID, ext });
  if (socket.connected && lrsEnabled) {
    socket.emit('xapi:statement', stmt);
  } else {
    xapiQueue.push(stmt);
    reportQueueSize();
  }
}

// ── xAPI LRS gate ────────────────────────────────────────────────────────────

let lrsEnabled = false;

socket.on('xapi:lrs:set', ({ enabled }: { enabled: boolean }) => {
  lrsEnabled = enabled;
  console.log(`[${AGENT_ID}] xAPI LRS ${enabled ? 'enabled' : 'disabled'}`);
  if (enabled && socket.connected && xapiQueue.size() > 0) {
    console.log(`[${AGENT_ID}] flushing ${xapiQueue.size()} queued xAPI statements`);
    xapiQueue.flush(s => socket.emit('xapi:statement', s));
  }
  reportQueueSize();
});

function reportQueueSize() {
  if (socket.connected) socket.emit('xapi:queue:size', { nodeId: AGENT_ID, queued: xapiQueue.size() });
}

setInterval(reportQueueSize, 5_000);

// ── Emulation control ────────────────────────────────────────────────────────

let emulating = false;

socket.on('kiosk:emulate:start', ({ nodeId }: { nodeId: string }) => {
  if (nodeId !== AGENT_ID) return;
  emulating = true;
  visiting  = false;
  if (slideTimer)  { clearTimeout(slideTimer);  slideTimer  = null; }
  if (departTimer) { clearTimeout(departTimer); departTimer = null; }
  console.log(`[${AGENT_ID}] emulation mode — auto-sim paused`);
  socket.emit('kiosk:emulate:ready', { nodeId: AGENT_ID });
});

socket.on('kiosk:emulate:stop', ({ nodeId }: { nodeId: string }) => {
  if (nodeId !== AGENT_ID) return;
  emulating = false;
  console.log(`[${AGENT_ID}] emulation ended — resuming auto-sim`);
  scheduleNextVisitor();
});

socket.on('kiosk:scan', ({ nodeId, data }: { nodeId: string; data: string }) => {
  if (nodeId !== AGENT_ID || !emulating) return;
  console.log(`[${AGENT_ID}] scanned: ${data}`);
  emulatedId = data;
  startVisit();
});

// ── Visitor simulation ───────────────────────────────────────────────────────

const SLIDES = ['info-build-racer', 'info-controls', 'info-cornering', 'info-scan-qr'];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

let visiting   = false;
let emulatedId = '';
let slideTimer:  ReturnType<typeof setTimeout> | null = null;
let departTimer: ReturnType<typeof setTimeout> | null = null;

function depart(dwellSecs: number) {
  if (!visiting) return;
  visiting = false;
  if (slideTimer)  { clearTimeout(slideTimer);  slideTimer  = null; }
  if (departTimer) { clearTimeout(departTimer); departTimer = null; }
  console.log(`[${AGENT_ID}] VISITOR_DEPART dwell=${dwellSecs}s`);
  xapi('visitor', emulatedId, 'exited', `${ACTIVITY_BASE}/info-kiosk/slideshow`, 'Fleet Info Kiosk', { dwell: dwellSecs });
  setTimeout(scheduleNextVisitor, rand(8_000, 40_000));
}

function startVisit() {
  visiting = true;
  const dwellMs = rand(20_000, 90_000);
  console.log(`[${AGENT_ID}] VISITOR_ARRIVE`);
  xapi('visitor', emulatedId, 'launched', `${ACTIVITY_BASE}/info-kiosk/slideshow`, 'Fleet Info Kiosk');

  let slideIdx = Math.floor(Math.random() * SLIDES.length);
  const slideName = SLIDES[slideIdx];
  console.log(`[${AGENT_ID}] SLIDE_VIEW slide=${slideName}`);
  xapi('visitor', emulatedId, 'experienced', `${ACTIVITY_BASE}/info-kiosk/slide/${slideName}`, slideName.replace(/-/g, ' '));

  const scheduleSlide = (remainingMs: number) => {
    const delay = rand(8_000, 20_000);
    if (delay >= remainingMs - 3_000) return;
    slideTimer = setTimeout(() => {
      if (!visiting) return;
      slideIdx = (slideIdx + 1) % SLIDES.length;
      const name = SLIDES[slideIdx];
      console.log(`[${AGENT_ID}] SLIDE_VIEW slide=${name}`);
      xapi('visitor', emulatedId, 'experienced', `${ACTIVITY_BASE}/info-kiosk/slide/${name}`, name.replace(/-/g, ' '));
      scheduleSlide(remainingMs - delay);
    }, delay);
  };
  scheduleSlide(dwellMs);

  if (Math.random() < 0.25) {
    const qrDelay = Math.floor(dwellMs * (0.6 + Math.random() * 0.3));
    setTimeout(() => {
      if (visiting) {
        console.log(`[${AGENT_ID}] QR_SCAN`);
        xapi('visitor', emulatedId, 'interacted', `${ACTIVITY_BASE}/info-kiosk/qr-code`, 'Registration QR Code');
      }
    }, qrDelay);
  }

  departTimer = setTimeout(() => depart(Math.round(dwellMs / 1000)), dwellMs);
}

function scheduleNextVisitor() {
  if (emulating) return;
  setTimeout(() => { if (!emulating) startVisit(); }, rand(10_000, 45_000));
}

console.log(`[${AGENT_ID}] starting — role=${AGENT_ROLE} parent=${AGENT_PARENT ?? 'none'} homebase=${HOMEBASE_URL}`);

setTimeout(scheduleNextVisitor, rand(0, 25_000));
