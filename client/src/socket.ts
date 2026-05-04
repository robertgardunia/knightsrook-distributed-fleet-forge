import { io } from 'socket.io-client';
// In dev, stay on HTTP polling — Vite's ws proxy is unreliable on Windows.
// In prod, same-origin so all transports work fine.
export const socket = import.meta.env.DEV
  ? io({ transports: ['polling'] })
  : io();
