import { execFileSync } from 'node:child_process';
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

// What the front reads at start, as two static files at the root of the app
// (docs/architecture.md, "Versions and the changelog"):
//   - version.json: the version of package.json, the instant of the build and
//     the commit of main it was built from ("local" outside the GitHub Action);
//   - changelog.json: the changes of each version, in English and in French
//     (web/src/changelog/). Served as a file rather than built into the code,
//     so that the tests can give the screen other versions.
function aboutTheApp(): Plugin {
  const version = () =>
    JSON.stringify({
      version: JSON.parse(readFileSync('package.json', 'utf8')).version,
      // In the GitHub Action, the instant of the commit of main, not of the
      // build: building the same commit twice gives the same files, and beta
      // gets a new commit only when something changed.
      builtAt: process.env.GITHUB_SHA
        ? execFileSync('git', ['log', '-1', '--format=%cI'], { encoding: 'utf8' }).trim()
        : new Date().toISOString(),
      commit: process.env.GITHUB_SHA ?? 'local',
    });
  const changelog = () =>
    JSON.stringify({
      en: JSON.parse(readFileSync('web/src/changelog/en.json', 'utf8')),
      fr: JSON.parse(readFileSync('web/src/changelog/fr.json', 'utf8')),
    });
  const files: Record<string, () => string> = {
    '/version.json': version,
    '/changelog.json': changelog,
  };

  return {
    name: 'aboutTheApp',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = files[(request.url ?? '').split('?')[0] ?? ''];
        if (!file) return next();
        response.setHeader('Content-Type', 'application/json');
        response.end(file());
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: name.slice(1), source: file() });
      }
    },
  };
}

// The front lives in web/ and is built to static files in web/dist.
// In development, calls to /api are forwarded to the PHP container.
export default defineConfig({
  root: 'web',
  plugins: [react(), museScoreEngine(), aboutTheApp()],
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
