// Brings a fresh copy of the repository to a running local app: npm run setup
//
// Safe to run again at any time: every step either does its work or finds it
// already done. It never touches the data of the local database.
// Uses Node only, so that it runs before any package is installed.

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

const steps = [
  ['Checking Node', checkNode],
  ['Checking Docker', checkDocker],
  ['Installing the JavaScript packages', () => run('npm ci')],
  ['Creating the local configuration', createConfig],
  ['Building the Docker images', () => run('docker compose --profile tools build')],
  ['Installing the PHP libraries', () => run('npm run api:install')],
  ['Building the front', () => run('npm run build')],
  ['Starting the local stack', () => run('npm run stack:up')],
  ['Applying the migrations', () => run('npm run db:migrate')],
  ['Preparing the test database', () => run('npm run test:prepare')],
  ['Installing the test browsers', () => run('npm run test:install')],
];

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

function stop(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    stop(`Node 22.12 or later is needed; this is Node ${process.versions.node}.`);
  }
  console.log(`Node ${process.versions.node}`);
}

function checkDocker() {
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    stop('Docker does not answer. Install Docker Desktop, start it, then run this again.');
  }
  console.log('Docker is running');
}

function createConfig() {
  if (existsSync('api/config.php')) {
    console.log('api/config.php already exists: left as it is');
    return;
  }
  copyFileSync('api/config.local.php', 'api/config.php');
  console.log('api/config.php created from api/config.local.php');
}

for (const [index, [title, step]] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${title}`);
  try {
    step();
  } catch {
    stop(`Stopped at "${title}". Fix what is reported above, then run "npm run setup" again.`);
  }
}

console.log(`
Ready.
  The app            http://localhost:8080
  Work on the front  npm run dev, then http://localhost:5173
  Run the tests      npm test
  Check the code     npm run check
  Stop the stack     npm run stack:down
How it all works: docs/architecture.md`);
