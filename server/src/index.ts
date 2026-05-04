import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { buildMockFleet } from './lib/mockFleet.js';
import { FleetRegistry } from './lib/fleetRegistry.js';

const PORT     = Number(process.env.PORT) || 5020;
const USE_MOCK = process.env.USE_MOCK === 'true';

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const registry = new FleetRegistry(() => {
  if (!USE_MOCK) io.emit('fleet:graph', registry.buildGraph());
});

function getGraph() {
  return (USE_MOCK || registry.size === 0) ? buildMockFleet() : registry.buildGraph();
}

io.on('connection', (socket) => {
  socket.emit('fleet:graph', getGraph());
  socket.on('fleet:request', () => socket.emit('fleet:graph', getGraph()));

  socket.on('agent:register', (data) => registry.register(data));
  socket.on('agent:heartbeat', (data) => registry.heartbeat(data.id));
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} — mode: ${USE_MOCK ? 'mock' : 'live (mock fallback when empty)'}`);
});
