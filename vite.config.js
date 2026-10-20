import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Forward the browser's real host so the API can verify same-origin writes.
const api = {
  target: 'http://127.0.0.1:3000',
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq, req) => proxyReq.setHeader('x-forwarded-host', req.headers.host));
  },
};

// Vite 7 keeps a snapshot of the public dir from server start and only updates
// it from watcher events. Bulk-imported covers drop into public/covers while
// the dev server runs, so /covers must be served straight from disk, not from
// that snapshot. (The watcher ignores public/* so runaway rewrites of
// public/data and cover uploads never full-reload long-running admin pages.)
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif',
};

const livePublicCovers = {
  name: 'live-public-covers',
  configureServer(server) {
    const coversDir = path.resolve(__dirname, 'public/covers');
    server.middlewares.use('/covers', (req, res, next) => {
      try {
        let relative = decodeURIComponent(String(req.url || '').split('?')[0]).replace(/^[/\\]+/, '');
        const file = path.resolve(coversDir, relative);
        if (!file.startsWith(coversDir + path.sep)) return next();
        const stat = fs.statSync(file, { throwIfNoEntry: false });
        if (!stat || !stat.isFile()) return next();
        res.writeHead(200, {
          'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-cache',
        });
        res.end(fs.readFileSync(file));
      } catch { next(); }
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), livePublicCovers],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // server/export-data.js rewrites public/data/*.json (and imports drop new
  // covers into public/covers) while the dev server runs; the watcher must not
  // full-reload the page because of those generated files, or long admin runs
  // (e.g. the bulk import) lose their live state.
  server: {
    proxy: { '/api': api },
    watch: { ignored: ['**/public/data/**', '**/public/covers/**'] },
  },
  preview: { proxy: { '/api': api } },
});
