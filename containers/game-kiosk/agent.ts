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

console.log(`[${AGENT_ID}] starting — role=${AGENT_ROLE} parent=${AGENT_PARENT ?? 'none'} homebase=${HOMEBASE_URL}`);
