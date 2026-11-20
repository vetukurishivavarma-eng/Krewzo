import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backend = process.env.KREWZO_API || 'http://localhost:4000';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': backend, '/socket.io': { target: backend, ws: true } } },
});
