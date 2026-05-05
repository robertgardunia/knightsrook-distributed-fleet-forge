import { io } from 'socket.io-client';

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

// ── Visitor simulation ───────────────────────────────────────────────────────

const SLIDES = ['info-build-racer.png', 'info-controls.png', 'info-cornering.png', 'info-scan-qr.png'];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

let visiting = false;
let slideTimer: ReturnType<typeof setTimeout> | null = null;
let departTimer: ReturnType<typeof setTimeout> | null = null;

function depart(dwellSecs: number) {
  if (!visiting) return;
  visiting = false;
  if (slideTimer)  { clearTimeout(slideTimer);  slideTimer  = null; }
  if (departTimer) { clearTimeout(departTimer); departTimer = null; }
  console.log(`[${AGENT_ID}] VISITOR_DEPART dwell=${dwellSecs}s`);
  console.log(`[${AGENT_ID}] xAPI verb=exited actor=visitor object=info-kiosk/slideshow dwell=${dwellSecs}s`);
  setTimeout(scheduleNextVisitor, rand(8_000, 40_000));
}

function startVisit() {
  visiting = true;
  const dwellMs = rand(20_000, 90_000);
  console.log(`[${AGENT_ID}] VISITOR_ARRIVE`);
  console.log(`[${AGENT_ID}] xAPI verb=launched actor=visitor object=info-kiosk/slideshow`);

  // Log initial slide
  let slideIdx = Math.floor(Math.random() * SLIDES.length);
  console.log(`[${AGENT_ID}] SLIDE_VIEW slide=${SLIDES[slideIdx]}`);
  console.log(`[${AGENT_ID}] xAPI verb=experienced actor=visitor object=info-kiosk/${SLIDES[slideIdx]}`);

  // Schedule subsequent slide views during the dwell
  const scheduleSlide = (remainingMs: number) => {
    const delay = rand(8_000, 20_000);
    if (delay >= remainingMs - 3_000) return;
    slideTimer = setTimeout(() => {
      if (!visiting) return;
      slideIdx = (slideIdx + 1) % SLIDES.length;
      console.log(`[${AGENT_ID}] SLIDE_VIEW slide=${SLIDES[slideIdx]}`);
      console.log(`[${AGENT_ID}] xAPI verb=experienced actor=visitor object=info-kiosk/${SLIDES[slideIdx]}`);
      scheduleSlide(remainingMs - delay);
    }, delay);
  };
  scheduleSlide(dwellMs);

  // Maybe scan QR code in last quarter of visit
  if (Math.random() < 0.25) {
    const qrDelay = Math.floor(dwellMs * (0.6 + Math.random() * 0.3));
    setTimeout(() => {
      if (visiting) {
        console.log(`[${AGENT_ID}] QR_SCAN`);
        console.log(`[${AGENT_ID}] xAPI verb=interacted actor=visitor object=info-kiosk/qr-code`);
      }
    }, qrDelay);
  }

  departTimer = setTimeout(() => depart(Math.round(dwellMs / 1000)), dwellMs);
}

function scheduleNextVisitor() {
  setTimeout(startVisit, rand(10_000, 45_000));
}

console.log(`[${AGENT_ID}] starting — role=${AGENT_ROLE} parent=${AGENT_PARENT ?? 'none'} homebase=${HOMEBASE_URL}`);

setTimeout(scheduleNextVisitor, rand(0, 25_000));
