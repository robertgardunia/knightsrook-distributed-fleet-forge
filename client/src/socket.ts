import { io } from 'socket.io-client';

export const socket = io({ reconnectionDelay: 2000, reconnectionDelayMax: 10000 });

// Switch the socket to a different server URL without changing the exported reference.
// All components that imported socket will seamlessly receive events from the new connection.
export function reconnectTo(url: string) {
  socket.disconnect();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (socket.io as any).uri = url;
  socket.connect();
}
