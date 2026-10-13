import { execFileSync } from 'node:child_process';

// The storage folder of the test server: what the app keeps of the files it is given.

/** The files kept in an area ("band", "members", "songs"), as paths relative to the storage folder. */
export function storedFiles(area: string): string[] {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'web-test',
      'sh',
      '-c',
      `cd /var/www/storage && find ${area} -type f 2>/dev/null | sort`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
}

export function emptyStorage(): void {
  execFileSync('docker', [
    'compose',
    'exec',
    '-T',
    'web-test',
    'sh',
    '-c',
    'rm -rf /var/www/storage/band /var/www/storage/members /var/www/storage/songs /var/www/storage/costumes',
  ]);
}
