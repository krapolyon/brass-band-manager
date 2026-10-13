// Assembles what a host receives, in build/release/: npm run release:assemble
// Run by the GitHub Action that fills the "beta" branch, after "npm run build".
// It can be run on a computer to look at the result; it changes nothing else.
//
//   build/release/
//     .htaccess     refuses everything: only web/ is served
//     web/          the built front, and api/, the relay to the API
//     api/          the code of the API with its libraries, without those of development
//     database/     the migrations
//
// config.php and storage/ are not part of it: they live beside the deployed
// folder, where a deployment never writes (api/bootstrap.php).
// See docs/architecture.md, "Deployment".

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

const out = 'build/release';

if (!existsSync('web/dist/index.html')) {
  console.error('The front is not built: run "npm run build" first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
for (const folder of ['web/api', 'api', 'database']) {
  mkdirSync(`${out}/${folder}`, { recursive: true });
}

copyFileSync('deploy/root.htaccess', `${out}/.htaccess`);
copyFileSync('LICENSE', `${out}/LICENSE`);

// The front, with the rules of the host written before its own.
cpSync('web/dist', `${out}/web`, { recursive: true });
writeFileSync(
  `${out}/web/.htaccess`,
  readFileSync('deploy/web.htaccess', 'utf8') + readFileSync('web/public/.htaccess', 'utf8'),
);
copyFileSync('deploy/web-api.htaccess', `${out}/web/api/.htaccess`);
copyFileSync('deploy/web-api-index.php', `${out}/web/api/index.php`);

// The API: what it runs with, and nothing of a computer (its configuration,
// its libraries, which are installed again below).
for (const name of [
  'bootstrap.php',
  'routes.php',
  'composer.json',
  'composer.lock',
  'config.example.php',
]) {
  copyFileSync(`api/${name}`, `${out}/api/${name}`);
}
for (const name of ['public', 'src', 'resources', 'tasks']) {
  cpSync(`api/${name}`, `${out}/api/${name}`, { recursive: true });
}

cpSync('database/migrations', `${out}/database/migrations`, { recursive: true });
copyFileSync('database/migrate.php', `${out}/database/migrate.php`);

// The libraries the lock file names, without the development tools. Composer
// runs in Docker, as everywhere in this project.
execFileSync(
  'docker',
  [
    'compose',
    'run',
    '--rm',
    'php',
    'composer',
    'install',
    '--no-dev',
    '--prefer-dist',
    '--optimize-autoloader',
    '--no-interaction',
    '--no-progress',
    `--working-dir=/app/${out}/api`,
  ],
  { stdio: 'inherit' },
);

// A library Composer fetched as a Git repository instead of an archive would
// reach the branch as an empty folder: stop here instead.
const nested = readdirSync(out, { recursive: true }).filter(
  (path) => path === '.git' || String(path).endsWith('/.git'),
);
if (nested.length > 0) {
  console.error(`A Git repository was found in the tree: ${nested.join(', ')}`);
  process.exit(1);
}

console.log(`\nAssembled in ${out}/`);
