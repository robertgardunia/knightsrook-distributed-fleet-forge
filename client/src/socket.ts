import { io } from 'socket.io-client';
// In dev, connect directly to the backend to avoid Vite proxy WS issues.
const URL = import.meta.env.DEV ? 'http://127.0.0.1:5020' : undefined;
export const socket = io(URL);
