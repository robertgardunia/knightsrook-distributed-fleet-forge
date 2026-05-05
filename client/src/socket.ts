import { io } from 'socket.io-client';

export const socket = io({ reconnectionDelay: 2000, reconnectionDelayMax: 10000 });

// Switch the socket to a different server URL without changing the exported reference.
// All components that imported socket will seamlessly receive events from the new connection.
export function reconnectTo(url: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mgr = socket.io as any;
  mgr.reconnection(false);   // kill any pending reconnect loop before we switch URI
  socket.disconnect();
  mgr.uri = url;
  mgr.reconnection(true);
  socket.connect();
}
