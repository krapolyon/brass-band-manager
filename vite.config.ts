import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The MuseScore engine (webmscore) is a program compiled for the browser: it
// looks for its own files beside itself, under their own names. They are
// served as they are at /webmscore/, outside the bundle, and are loaded only
// by the browser of whoever sends a MuseScore file (web/src/screens/songs/
// score.worker.ts).
const ENGINE_FILES = [
  'webmscore.mjs',
  'webmscore.lib.wasm',
  'webmscore.lib.mem.wasm',
  'webmscore.lib.data',
];
const ENGINE_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
};

function museScoreEngine(): Plugin {
  const folder = path.dirname(createRequire(import.meta.url).resolve('webmscore/package.json'));

  return {
    name: 'museScoreEngine',
    configureServer(server) {
      server.middlewares.use('/webmscore', (request, response, next) => {
        const name = (request.url ?? '').split('?')[0]?.slice(1) ?? '';
        if (!ENGINE_FILES.includes(name)) return next();
        response.setHeader('Content-Type', ENGINE_TYPES[path.extname(name)] ?? '');
        createReadStream(path.join(folder, name)).pipe(response);
      });
    },
    generateBundle() {
      for (const name of ENGINE_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `webmscore/${name}`,
          source: readFileSync(path.join(folder, name)),
        });
      }
    },
  };
}

// The front lives in web/ and is built to static files in web/dist.
// In development, calls to /api are forwarded to the PHP container.
export default defineConfig({
  root: 'web',
  plugins: [react(), museScoreEngine()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
