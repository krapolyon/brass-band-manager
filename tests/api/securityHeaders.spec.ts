import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The security headers of the front (issue #51, docs/architecture.md,
// "What the host receives"). The local stack serves web/public/.htaccess as
// the host does; HSTS is written for the host alone (deploy/web.htaccess),
// which is read here as the release script assembles it. Whether a screen is
// refused something by the policy is checked after every screen test
// (tests/support/test.ts).

const headersOf = async (request: import('@playwright/test').APIRequestContext, path: string) =>
  (await request.get(path)).headersArray();

const valuesOf = (headers: { name: string; value: string }[], name: string) =>
  headers.filter((header) => header.name.toLowerCase() === name.toLowerCase()).map((h) => h.value);

test('a screen of the front carries each security header once', async ({ request }) => {
  for (const path of ['/sign-in', '/', '/songs/12', '/sw.js']) {
    const headers = await headersOf(request, path);
    expect(valuesOf(headers, 'X-Content-Type-Options'), path).toEqual(['nosniff']);
    expect(valuesOf(headers, 'Referrer-Policy'), path).toEqual(['strict-origin-when-cross-origin']);
    expect(valuesOf(headers, 'X-Frame-Options'), path).toEqual(['DENY']);
    const [policy, ...more] = valuesOf(headers, 'Content-Security-Policy');
    expect(more, path).toEqual([]);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("object-src 'none'");
  }
});

test('only the worker that reads MuseScore files may write functions', async ({ request }) => {
  const worker = readdirSync('web/dist/assets').find((name) => name.startsWith('score.worker-'));
  expect(worker).toBeDefined();
  const [policy, ...more] = valuesOf(
    await headersOf(request, `/assets/${worker}`),
    'Content-Security-Policy',
  );
  expect(more).toEqual([]);
  expect(policy).toContain("script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval';");
  // Any other script of the app is held to the policy of the pages.
  const other = readdirSync('web/dist/assets').find(
    (name) => name.startsWith('index-') && name.endsWith('.js'),
  );
  const [page] = valuesOf(await headersOf(request, `/assets/${other}`), 'Content-Security-Policy');
  expect(page).not.toContain("'unsafe-eval'");
});

test('the policy of the front is not added to the answers of the API', async ({ request }) => {
  const headers = await headersOf(request, '/api/band');
  expect(valuesOf(headers, 'Content-Security-Policy')).toEqual([]);
  expect(valuesOf(headers, 'X-Content-Type-Options')).toEqual(['nosniff']);
});

test('the host gets HSTS on the front, once, without includeSubDomains', () => {
  // What scripts/assemble-release.mjs writes to web/.htaccess.
  const assembled =
    readFileSync('deploy/web.htaccess', 'utf8') + readFileSync('web/public/.htaccess', 'utf8');
  const hsts = assembled.match(/Header always set Strict-Transport-Security "([^"]+)"/g) ?? [];
  expect(hsts).toEqual(['Header always set Strict-Transport-Security "max-age=31536000"']);
  // Not on /api, whose HSTS PHP writes (api/public/index.php).
  expect(assembled).toContain('<If "%{REQUEST_URI} !~ m#^/api/#">');
});
