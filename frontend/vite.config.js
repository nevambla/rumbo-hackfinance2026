import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La API es el backend de Python (cd backend && make dev). El proxy evita CORS en desarrollo.
const API = process.env.RUMBO_API || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': API } },
  preview: { port: 4173, proxy: { '/api': API } },
});
