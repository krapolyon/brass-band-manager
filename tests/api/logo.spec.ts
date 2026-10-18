import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { logoInput, png, svg } from '../support/images.ts';
import { addMember, admin, install, installInput, signIn } from '../support/scenario.ts';
import { emptyStorage, storedFiles } from '../support/storage.ts';

// The logo of the band and the icons of the installed app. Rules:
// model/band.md, "Rules" and "Access rights".

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
});

test('a band without a logo has none to show, and the app keeps its neutral icons', async ({
  request,
}) => {
  expect(await (await request.get('/api/band')).json()).toMatchObject({
    name: 'La Fanfare des Cuivres Déchaînés',
    logoUrl: null,
    icons: null,
  });
  expect((await request.get('/api/band/logo')).status()).toBe(404);
  expect((await request.get('/api/band/icon/192')).status()).toBe(404);

  const manifest = await request.get('/api/manifest');
  expect(manifest.headers()['content-type']).toContain('application/manifest+json');
  expect(await manifest.json()).toMatchObject({
    name: 'La Fanfare des Cuivres Déchaînés',
    icons: [{ src: '/appIcons/icon-192.png' }, { src: '/appIcons/icon-512.png' }],
  });
});

test('before install the manifest has a neutral name', async ({ request }) => {
  emptyDatabase();
  const manifest = await (await request.get('/api/manifest')).json();

  expect(manifest.name).toBe('Brass band');
  expect(manifest.icons).toHaveLength(2);
});

test('an admin gives the band a logo; anyone can then see it and its icons', async ({
  request,
  playwright,
  baseURL,
}) => {
  await signIn(request, admin.email, admin.password);
  const response = await request.put('/api/band/logo', { data: logoInput() });
  expect(response.status()).toBe(200);
  const { logoUrl, icons } = await response.json();

  // Stored under a name chosen by the app.
  const path = sql('SELECT logoPath FROM band');
  expect(path).toMatch(/^band\/[0-9a-f]{16}\/logo\.svg$/);
  expect(sql('SELECT updatedByMemberId IS NOT NULL FROM band')).toBe('1');
  expect(storedFiles('band')).toHaveLength(4);

  // Someone who is not signed in.
  const visitor = await playwright.request.newContext({ baseURL });
  expect(await (await visitor.get('/api/band')).json()).toMatchObject({
    name: 'La Fanfare des Cuivres Déchaînés',
    logoUrl,
    icons,
  });

  const logo = await visitor.get(logoUrl);
  expect(logo.status()).toBe(200);
  expect(await logo.body()).toEqual(svg);
  const headers = logo.headers();
  expect(headers['content-type']).toBe('image/svg+xml');
  // An SVG can carry scripts: opened by its address, it may run nothing.
  expect(headers['content-security-policy']).toContain("default-src 'none'");
  expect(headers['content-security-policy']).toContain('sandbox');
  expect(headers['x-content-type-options']).toBe('nosniff');
  // Its address changes with the logo: the browser may keep it.
  expect(headers['cache-control']).toContain('immutable');
  expect((await visitor.get('/api/band/logo')).headers()['cache-control']).toBe('no-cache');

  for (const size of ['180', '192', '512']) {
    const icon = await visitor.get(icons[size]);
    expect(icon.headers()['content-type']).toBe('image/png');
    expect(await icon.body()).toEqual(png(Number(size)));
  }
  expect((await visitor.get('/api/band/icon/64')).status()).toBe(404);

  const manifest = await (await visitor.get('/api/manifest')).json();
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([icons[192], icons[512]]);
  await visitor.dispose();
});

test('the type of a logo comes from its content, whatever it is', async ({ request }) => {
  await signIn(request, admin.email, admin.password);

  await request.put('/api/band/logo', { data: logoInput(png(64)) });
  expect(sql('SELECT logoPath FROM band')).toMatch(/logo\.png$/);
  const { logoUrl } = await (await request.get('/api/band')).json();
  expect((await request.get(logoUrl)).headers()['content-type']).toBe('image/png');
});

test('replacing the logo replaces its files, and removing it removes them', async ({ request }) => {
  await signIn(request, admin.email, admin.password);
  const first = await (await request.put('/api/band/logo', { data: logoInput() })).json();
  const second = await (await request.put('/api/band/logo', { data: logoInput(png(32)) })).json();

  expect(second.logoUrl).not.toBe(first.logoUrl);
  expect(storedFiles('band')).toHaveLength(4);
  // The old address gives the new logo, and is no longer kept by browsers.
  const old = await request.get(first.logoUrl);
  expect(old.headers()['content-type']).toBe('image/png');
  expect(old.headers()['cache-control']).toBe('no-cache');

  const removed = await request.delete('/api/band/logo');
  expect(await removed.json()).toEqual({ logoUrl: null, icons: null, appIconUrl: null });
  expect(sql('SELECT logoPath IS NULL FROM band')).toBe('1');
  expect(storedFiles('band')).toEqual([]);
  expect((await request.get(second.logoUrl)).status()).toBe(404);
});

test('only who manages the band changes or removes its logo', async ({ playwright, baseURL }) => {
  const setup = await playwright.request.newContext({ baseURL });
  await signIn(setup, admin.email, admin.password);
  await setup.put('/api/band/logo', { data: logoInput() });
  await setup.dispose();
  const path = sql('SELECT logoPath FROM band');

  const visitor = await playwright.request.newContext({ baseURL });
  expect((await visitor.put('/api/band/logo', { data: logoInput() })).status()).toBe(401);
  expect((await visitor.delete('/api/band/logo')).status()).toBe(401);
  await visitor.dispose();

  const others = [
    addMember({ nickname: 'Zaza' }),
    addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] }),
    addMember({ nickname: 'Lulu', roles: ['SONG_MANAGER', 'GIG_MANAGER', 'SETLIST_MANAGER'] }),
  ];
  for (const email of others) {
    const context = await playwright.request.newContext({ baseURL });
    await signIn(context, email);
    expect((await context.put('/api/band/logo', { data: logoInput() })).status(), email).toBe(403);
    expect((await context.delete('/api/band/logo')).status(), email).toBe(403);
    await context.dispose();
  }

  expect(sql('SELECT logoPath FROM band')).toBe(path);
  expect(storedFiles('band')).toHaveLength(4);
});

test('what is not a logo is refused, and nothing is kept', async ({ request }) => {
  await signIn(request, admin.email, admin.password);
  const refused = async (data: object, problem: string) => {
    const response = await request.put('/api/band/logo', { data });
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ error: 'invalidInput', fields: { logo: problem } });
  };
  const text = (content: string) => logoInput(Buffer.from(content));

  // Heavier than 2 MB.
  await refused(logoInput(Buffer.concat([svg, Buffer.alloc(2_000_000, ' ')])), 'tooBig');
  // Not an image at all, or one of another format.
  await refused(text('%PDF-1.7'), 'invalid');
  await refused(text('GIF89a'), 'invalid');
  await refused(
    text('<html xmlns="http://www.w3.org/2000/svg"><script>1</script></html>'),
    'invalid',
  );
  await refused({ ...logoInput(), image: 'not base64 !' }, 'invalid');
  await refused({ ...logoInput(), image: '' }, 'invalid');
  // An SVG that declares a document type, where attacks on XML readers are written.
  await refused(
    text(
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
    ),
    'invalid',
  );
  // The same, written in another encoding to slip past a search for "<!DOCTYPE".
  const hidden =
    '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>';
  await refused(
    logoInput(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(hidden, 'utf16le')])),
    'invalid',
  );
  // The first bytes of a PNG, followed by something else.
  const disguised = Buffer.concat([
    png(64).subarray(0, 33),
    Buffer.from('<html><script>1</script>'),
  ]);
  await refused(logoInput(disguised), 'invalid');
  await refused(
    {
      ...logoInput(),
      icon192: Buffer.concat([png(192).subarray(0, 33), Buffer.from('x')]).toString('base64'),
    },
    'invalid',
  );
  // An image of a few bytes that claims a gigantic size.
  const giant = Buffer.from(png(8));
  giant.writeUInt32BE(60000, 16);
  giant.writeUInt32BE(60000, 20);
  await refused(logoInput(giant), 'invalid');
  // Icons that are not the PNG squares expected.
  await refused({ ...logoInput(), icon192: png(512).toString('base64') }, 'invalid');
  await refused({ ...logoInput(), icon180: svg.toString('base64') }, 'invalid');

  // A part that is missing, or one too many.
  const { icon512: _, ...incomplete } = logoInput();
  expect((await request.put('/api/band/logo', { data: incomplete })).status()).toBe(422);
  expect(
    (
      await request.put('/api/band/logo', { data: { ...logoInput(), name: '../../x.php' } })
    ).status(),
  ).toBe(422);

  expect(sql('SELECT logoPath IS NULL FROM band')).toBe('1');
  expect(storedFiles('band')).toEqual([]);
});

test('install takes the logo with the rest', async ({ request }) => {
  emptyDatabase();
  const response = await request.post('/api/install', {
    data: { ...installInput(), logo: logoInput() },
  });

  expect(response.status()).toBe(201);
  expect(sql('SELECT logoPath FROM band')).toMatch(/^band\/[0-9a-f]{16}\/logo\.svg$/);
  expect(storedFiles('band')).toHaveLength(4);
});

test('an install that is refused keeps no file of its logo', async ({ request }) => {
  emptyDatabase();
  const faultyLogo = await request.post('/api/install', {
    data: { ...installInput(), logo: logoInput(Buffer.from('%PDF-1.7')) },
  });
  expect(faultyLogo.status()).toBe(422);
  expect((await faultyLogo.json()).fields).toEqual({ logo: 'invalid' });

  // A good logo, but two sections the database takes for the same.
  const input = installInput();
  input.sections.push(
    { name: 'Flute', instruments: ['Flûte'] },
    { name: 'Flûte', instruments: ['Fifre'] },
  );
  const duplicate = await request.post('/api/install', { data: { ...input, logo: logoInput() } });
  expect(duplicate.status()).toBe(422);

  expect(sql('SELECT COUNT(*) FROM band')).toBe('0');
  expect(storedFiles('band')).toEqual([]);
});

test('logos sent at the same instant leave the files of one logo only', async ({ request }) => {
  await signIn(request, admin.email, admin.password);
  const answers = await Promise.all(
    Array.from({ length: 8 }, () => request.put('/api/band/logo', { data: logoInput() })),
  );

  expect(answers.map((answer) => answer.status())).toEqual(Array(8).fill(200));
  expect(storedFiles('band')).toHaveLength(4);
  expect(storedFiles('band')[0]).toContain(sql('SELECT logoPath FROM band').split('/')[1]);
});

test('a logo sent from another site, or not as JSON, is refused', async ({ request }) => {
  await signIn(request, admin.email, admin.password);

  const crossSite = await request.put('/api/band/logo', {
    data: logoInput(),
    headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://elsewhere.example' },
  });
  expect(crossSite.status()).toBe(403);
  const removal = await request.delete('/api/band/logo', {
    headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://elsewhere.example' },
  });
  expect(removal.status()).toBe(403);
  const form = await request.put('/api/band/logo', { form: logoInput() });
  expect(form.status()).toBe(400);

  expect(storedFiles('band')).toEqual([]);
});

test('an install with a wrong key keeps no file of its logo', async ({ request }) => {
  emptyDatabase();
  const response = await request.post('/api/install', {
    data: { ...installInput(), installKey: 'not-the-right-key', logo: logoInput() },
  });

  expect(response.status()).toBe(403);
  expect(storedFiles('band')).toEqual([]);
});

test('a body larger than anything the app receives is refused before it is read', async ({
  playwright,
  baseURL,
}) => {
  // Not signed in: the refusal comes before anything else.
  const visitor = await playwright.request.newContext({ baseURL });
  const response = await visitor.put('/api/band/logo', {
    data: { image: 'x'.repeat(9_000_000) },
  });

  expect(response.status()).toBe(413);
  expect(await response.json()).toEqual({ error: 'bodyTooLarge' });
  await visitor.dispose();
});

test('the storage folder forbids the web server to serve it directly', async ({ request }) => {
  await signIn(request, admin.email, admin.password);
  await request.put('/api/band/logo', { data: logoInput() });

  const rule = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'web-test', 'cat', '/var/www/storage/.htaccess'],
    { encoding: 'utf8' },
  );
  expect(rule.trim()).toBe('Require all denied');
});

test.describe('the icon of the installed app (0.3.0, issue #34)', () => {
  test('a square image of its own: the icons come from it, the logo stays the logo', async ({
    request,
  }) => {
    await signIn(request, admin.email, admin.password);
    const logo = await (await request.put('/api/band/logo', { data: logoInput() })).json();

    const saved = await request.put('/api/band/appIcon', { data: logoInput(png(512)) });

    expect(saved.status()).toBe(200);
    const urls = await saved.json();
    expect(urls.logoUrl).toBe(logo.logoUrl);
    expect(urls.appIconUrl).toMatch(/^\/api\/band\/icon\/512\?v=[0-9a-f]{16}$/);
    expect(urls.icons['192']).not.toBe(logo.icons['192']);
    expect(await (await request.get('/api/band')).json()).toMatchObject(urls);
    expect(sql('SELECT iconPath FROM band')).toMatch(/^band\/[0-9a-f]{16}\/appIcon\.png$/);
    // The logo and its icons, the icon and its icons.
    expect(storedFiles('band')).toHaveLength(8);
    const manifest = await (await request.get('/api/manifest')).json();
    expect(manifest.icons[1].src).toBe(urls.icons['512']);
    expect((await request.get(urls.icons['180'])).headers()['content-type']).toBe('image/png');

    // Removed: the icons are those of the logo again.
    const removed = await (await request.delete('/api/band/appIcon')).json();
    expect(removed).toEqual({ ...logo, appIconUrl: null });
    expect(storedFiles('band')).toHaveLength(4);
    expect(sql('SELECT iconPath IS NULL FROM band')).toBe('1');
  });

  test('without a logo, the icon alone makes the icons; removing the logo keeps them', async ({
    request,
  }) => {
    await signIn(request, admin.email, admin.password);
    await request.put('/api/band/logo', { data: logoInput() });
    const icon = await (
      await request.put('/api/band/appIcon', { data: logoInput(png(600)) })
    ).json();

    const afterLogo = await (await request.delete('/api/band/logo')).json();

    expect(afterLogo).toEqual({ logoUrl: null, icons: icon.icons, appIconUrl: icon.appIconUrl });
    expect((await request.get('/api/band/icon/192')).status()).toBe(200);
  });

  test('an image that is not square, too small, an SVG or too heavy is refused', async ({
    request,
  }) => {
    await signIn(request, admin.email, admin.password);
    const faults: [Buffer, string][] = [
      [png(600, 512), 'notSquare'],
      [png(256), 'tooSmall'],
      [svg, 'invalid'],
      [Buffer.alloc(2_000_001, 1), 'tooBig'],
    ];
    for (const [image, problem] of faults) {
      const refused = await request.put('/api/band/appIcon', { data: logoInput(image) });
      expect(await refused.json(), problem).toEqual({
        error: 'invalidInput',
        fields: { appIcon: problem },
      });
    }
    // Icons that are not the PNGs of the three sizes are refused too.
    const wrongIcons = await request.put('/api/band/appIcon', {
      data: { ...logoInput(png(512)), icon192: png(180).toString('base64') },
    });
    expect((await wrongIcons.json()).fields).toEqual({ appIcon: 'invalid' });
    expect(storedFiles('band')).toEqual([]);
  });

  test('only who manages the band gives or removes it', async ({ playwright, baseURL }) => {
    const visitor = await playwright.request.newContext({ baseURL });
    expect((await visitor.put('/api/band/appIcon', { data: logoInput(png(512)) })).status()).toBe(
      401,
    );
    expect((await visitor.delete('/api/band/appIcon')).status()).toBe(401);
    await visitor.dispose();

    const member = await playwright.request.newContext({ baseURL });
    await signIn(
      member,
      addMember({ nickname: 'Sisi', roles: ['SONG_MANAGER', 'GIG_MANAGER', 'MEMBER_MANAGER'] }),
    );
    expect((await member.put('/api/band/appIcon', { data: logoInput(png(512)) })).status()).toBe(
      403,
    );
    expect((await member.delete('/api/band/appIcon')).status()).toBe(403);
    await member.dispose();
    expect(storedFiles('band')).toEqual([]);
  });
});
