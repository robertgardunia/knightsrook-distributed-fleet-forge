import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { buildMockFleet } from './lib/mockFleet.js';

const PORT = Number(process.env.PORT) || 5020;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  socket.emit('fleet:graph', buildMockFleet());
  socket.on('fleet:request', () => socket.emit('fleet:graph', buildMockFleet()));
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
