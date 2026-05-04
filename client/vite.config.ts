import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5300,
    proxy: {
      '/api': 'http://127.0.0.1:5020',
      '/socket.io': { target: 'http://127.0.0.1:5020', ws: true },
    },
  },
});
