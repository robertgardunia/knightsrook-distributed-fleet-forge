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

function emitEvent(type: string, extra: Record<string, string> = {}) {
  if (socket.connected) socket.emit('kiosk:event', { id: AGENT_ID, type, ...extra });
}

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
  if (sessionTimeout)  { clearTimeout(sessionTimeout);  sessionTimeout  = null; }
  if (nextEventTimeout) { clearTimeout(nextEventTimeout); nextEventTimeout = null; }
}

function signOut(reason: 'quit' | 'timeout' | 'displaced') {
  if (!currentPlayer) return;
  console.log(`[${AGENT_ID}] SIGNOUT player=${currentPlayer} session=${currentSession} games=${gamesThisSession} reason=${reason}`);
  emitEvent('SIGNOUT');
  currentPlayer = null;
  currentSession = null;
  gamesThisSession = 0;
  clearTimers();
  nextEventTimeout = setTimeout(scheduleArrival, rand(15_000, 50_000));
}

function endGame(totalScore: number) {
  if (!currentPlayer) return;
  console.log(`[${AGENT_ID}] GAME_OVER player=${currentPlayer} session=${currentSession} score=${totalScore}`);
  gamesThisSession++;
  // 45% chance of another round, otherwise idle a bit then leave
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
      if (lap < lapCount) {
        nextLap();
      } else {
        nextEventTimeout = setTimeout(() => endGame(totalScore), rand(2_000, 4_000));
      }
    }, lapMs);
  };

  nextLap();

  // Hard cap: 5 min per session regardless of game state
  if (sessionTimeout) clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => signOut('timeout'), 5 * 60_000);
}

function signIn(name: string) {
  if (currentPlayer) signOut('displaced');
  currentSession = sid();
  currentPlayer  = name;
  gamesThisSession = 0;
  console.log(`[${AGENT_ID}] SIGNIN player=${currentPlayer} session=${currentSession}`);
  emitEvent('SIGNIN', { player: currentPlayer });
  nextEventTimeout = setTimeout(() => startGame(), rand(2_000, 6_000));
}

function scheduleArrival() {
  nextEventTimeout = setTimeout(() => signIn(pick(PLAYERS)), rand(10_000, 45_000));
}

console.log(`[${AGENT_ID}] starting — role=${AGENT_ROLE} parent=${AGENT_PARENT ?? 'none'} homebase=${HOMEBASE_URL}`);

// Stagger startup so all kiosks don't arrive simultaneously
setTimeout(scheduleArrival, rand(0, 30_000));
