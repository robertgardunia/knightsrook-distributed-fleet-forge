import { io } from 'socket.io-client';
import { buildStatement, MemQueue, ACTIVITY_BASE } from '@knightsrook/xapi';
import { CodeCaptureService } from './lib/codeCapture.js';
import { attachHardwareScanner } from './lib/adapters/hardwareScanner.js';
import { attachControlInput } from './lib/adapters/controlInput.js';

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
  clearTimers();
  if (currentPlayer) signOut('displaced');
  console.log(`[${AGENT_ID}] emulation mode — auto-sim paused`);
  socket.emit('kiosk:emulate:ready', { nodeId: AGENT_ID });
});

socket.on('kiosk:emulate:stop', ({ nodeId }: { nodeId: string }) => {
  if (nodeId !== AGENT_ID) return;
  emulating = false;
  codeCapture.clear();
  console.log(`[${AGENT_ID}] emulation ended — resuming auto-sim`);
  scheduleArrival();
});

// ── Code capture service ──────────────────────────────────────────────────────

const codeCapture = new CodeCaptureService();

attachHardwareScanner(codeCapture);
attachControlInput(codeCapture, socket, AGENT_ID);

codeCapture.on('user:identified', (code: string) => {
  if (!emulating) return;
  console.log(`[${AGENT_ID}] code captured: ${code}`);
  signIn(code);
});

codeCapture.on('user:cleared', () => {
  if (currentPlayer) signOut('displaced');
});

// ── Player simulation ────────────────────────────────────────────────────────

const PLAYERS = [
  'Alex','Jordan','Riley','Morgan','Sam','Casey','Taylor','Devon','Skyler','Quinn',
  'Marcus','Jade','Kai','Zoe','Nate','Mia','Leo','Aria','Eli','Nova',
  'Hunter','Avery','Blake','Drew','Peyton','Reese','Sage','Tatum','Wren','Indigo',
];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function sid() { return Math.random().toString(16).slice(2, 6).toUpperCase(); }

let currentPlayer: string | null = null;
let currentSession: string | null = null;
let gamesThisSession = 0;
let sessionTimeout: ReturnType<typeof setTimeout> | null = null;
let nextEventTimeout: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (sessionTimeout)   { clearTimeout(sessionTimeout);   sessionTimeout   = null; }
  if (nextEventTimeout) { clearTimeout(nextEventTimeout); nextEventTimeout = null; }
}

function signOut(reason: 'quit' | 'timeout' | 'displaced') {
  if (!currentPlayer) return;
  console.log(`[${AGENT_ID}] SIGNOUT player=${currentPlayer} session=${currentSession} games=${gamesThisSession} reason=${reason}`);
  xapi(currentPlayer, currentPlayer, 'exited', `${ACTIVITY_BASE}/hexgl`, 'HexGL Racing Game', { reason, games: gamesThisSession });
  currentPlayer = null;
  currentSession = null;
  gamesThisSession = 0;
  clearTimers();
  nextEventTimeout = setTimeout(scheduleArrival, rand(15_000, 50_000));
}

function endGame(totalScore: number) {
  if (!currentPlayer) return;
  console.log(`[${AGENT_ID}] GAME_OVER player=${currentPlayer} session=${currentSession} score=${totalScore}`);
  xapi(currentPlayer, currentPlayer, 'completed', `${ACTIVITY_BASE}/hexgl`, 'HexGL Racing Game', { score: { raw: totalScore } });
  gamesThisSession++;
  if (Math.random() < 0.45) {
    nextEventTimeout = setTimeout(() => startGame(), rand(3_000, 8_000));
  } else {
    nextEventTimeout = setTimeout(() => signOut('quit'), rand(5_000, 25_000));
  }
}

function startGame() {
  if (!currentPlayer) return;
  const lapCount = rand(1, 3);
  console.log(`[${AGENT_ID}] GAME_START player=${currentPlayer} session=${currentSession} laps=${lapCount}`);
  xapi(currentPlayer, currentPlayer, 'launched', `${ACTIVITY_BASE}/hexgl`, 'HexGL Racing Game', { laps: lapCount });

  let lap = 0;
  let totalScore = 0;

  const nextLap = () => {
    if (!currentPlayer) return;
    lap++;
    const lapMs   = rand(8_000, 22_000);
    const lapSecs = (lapMs / 1000).toFixed(1);
    const score   = rand(700, 2800);
    totalScore += score;
    nextEventTimeout = setTimeout(() => {
      if (!currentPlayer) return;
      console.log(`[${AGENT_ID}] LAP_COMPLETE player=${currentPlayer} lap=${lap}/${lapCount} time=${lapSecs}s score=${score}`);
      xapi(currentPlayer, currentPlayer, 'progressed', `${ACTIVITY_BASE}/hexgl`, 'HexGL Racing Game', {
        lap: `${lap}/${lapCount}`, time: `${lapSecs}s`, score,
      });
      if (lap < lapCount) {
        nextLap();
      } else {
        nextEventTimeout = setTimeout(() => endGame(totalScore), rand(2_000, 4_000));
      }
    }, lapMs);
  };

  nextLap();

  if (sessionTimeout) clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => signOut('timeout'), 5 * 60_000);
}

function signIn(name: string) {
  if (currentPlayer) signOut('displaced');
  currentSession = sid();
  currentPlayer  = name;
  gamesThisSession = 0;
  console.log(`[${AGENT_ID}] SIGNIN player=${currentPlayer} session=${currentSession}`);
  xapi(currentPlayer, currentPlayer, 'initialized', `${ACTIVITY_BASE}/hexgl`, 'HexGL Racing Game');
  nextEventTimeout = setTimeout(() => startGame(), rand(2_000, 6_000));
}

function scheduleArrival() {
  if (emulating) return;
  nextEventTimeout = setTimeout(() => { if (!emulating) signIn(pick(PLAYERS)); }, rand(10_000, 45_000));
}

console.log(`[${AGENT_ID}] starting — role=${AGENT_ROLE} parent=${AGENT_PARENT ?? 'none'} homebase=${HOMEBASE_URL}`);

setTimeout(scheduleArrival, rand(0, 30_000));
