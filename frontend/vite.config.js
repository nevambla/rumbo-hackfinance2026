import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La API es el backend de Python (cd backend && make dev). El proxy evita CORS en desarrollo.
const API = process.env.RUMBO_API || 'http://127.0.0.1:8000';

// La landing (../landing, HTML estático) se sirve desde el mismo servidor en /landing/,
// así la landing y la app se enlazan con rutas relativas en los dos sentidos.
const LANDING_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../landing');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
};

function landingMiddleware(req, res, next) {
  const url = (req.url || '').split('?')[0];
  if (url === '/landing') { res.statusCode = 301; res.setHeader('Location', '/landing/'); return res.end(); }
  if (!url.startsWith('/landing/')) return next();
  let rel;
  try { rel = decodeURIComponent(url.slice('/landing/'.length)) || 'index.html'; } catch { return next(); }
  const file = path.resolve(LANDING_DIR, rel);
  if (!file.startsWith(LANDING_DIR + path.sep)) { res.statusCode = 403; return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', st.size);
    fs.createReadStream(file).pipe(res);
  });
}

function landing() {
  let outDir = 'dist';
  return {
    name: 'rumbo-landing',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    configureServer(server) { server.middlewares.use(landingMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(landingMiddleware); },
    // En el build, la landing se copia a dist/landing para servirla junto a la app.
    closeBundle() {
      if (!fs.existsSync(LANDING_DIR)) return;
      fs.cpSync(LANDING_DIR, path.join(outDir, 'landing'), { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });
    },
  };
}

export default defineConfig({
  plugins: [react(), landing()],
  server: { port: 5173, proxy: { '/api': API } },
  preview: { port: 4173, proxy: { '/api': API } },
});
