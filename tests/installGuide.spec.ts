import type { Page } from '@playwright/test';
import { emptyDatabase } from './support/database.ts';
import { addMember, install, memberPassword } from './support/scenario.ts';
import { expect, test } from './support/test.ts';

// The install guide (issue #36): putting the app on the home screen, offered
// once per device after sign-in, on a phone or a tablet in a browser. Rules:
// model/members.md, entry 3, "Install guide"; screens: Figma, Members,
// section 14. The device is told by what its browser says of itself.

// A device where the guide was never offered (the other tests of the screens
// start from one where it was).
test.use({ storageState: { cookies: [], origins: [] } });

const iPhoneChrome =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1';
const macSafari =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
});

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill('zaza@example.org');
  await page.getByLabel('Mot de passe', { exact: true }).fill(memberPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const later = (page: Page) => page.getByRole('button', { name: 'Plus tard' });

/** The app opened from its icon on the home screen. */
async function installed(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query === '(display-mode: standalone)'
        ? ({ ...original(query), matches: true } as MediaQueryList)
        : original(query);
  });
}

test('the guide of the device shows after sign-in, and "Plus tard" closes it for good', async ({
  page,
}, testInfo) => {
  await signIn(page);

  await expect(page).toHaveURL('/install-app');
  await expect(title(page)).toHaveText('Installe l’app');
  await expect(page.getByText('Elle sera sur ton écran d’accueil, comme ça.')).toBeVisible();
  if (testInfo.project.name === 'iphone') {
    const steps = page.getByRole('list').filter({ hasText: 'Partager' });
    await expect(page.getByRole('heading', { name: 'Sur ton iPhone' })).toBeVisible();
    // Each step after its number, which the list itself says.
    await expect(steps.getByRole('listitem')).toHaveText([
      // The steps of Safari as the owner sees them (0.3.2, issue #57).
      '1Touche l’adresse de l’app, puis « Partager ».',
      '2Touche [+] « Sur l’écran d’accueil ». Laisse « Ouvrir comme app web » activé.',
      '3Touche « Ajouter », puis ouvre l’app depuis sa nouvelle icône.',
    ]);
  } else {
    const steps = page.getByRole('list').filter({ hasText: 'menu' });
    await expect(page.getByRole('heading', { name: 'Sur ton téléphone' })).toBeVisible();
    await expect(steps.getByRole('listitem')).toHaveCount(3);
    await expect(steps.getByRole('listitem').first()).toHaveText(
      '1Touche le menu ⋮ en haut à droite du navigateur.',
    );
  }

  await later(page).click();
  await expect(page).toHaveURL('/');

  // Signed out and in again on the same device: straight home.
  await page.context().clearCookies();
  await signIn(page);
  await expect(page).toHaveURL('/');
});

test('the settings offer it while the app is not installed, and lead back there', async ({
  page,
}) => {
  await signIn(page);
  await later(page).click();
  await page.goto('/settings');

  const row = page.getByRole('link', { name: /Installer l’app/ });
  await expect(row).toContainText('Sur l’écran d’accueil de ce téléphone');
  await row.click();
  await expect(page).toHaveURL('/install-app');
  await later(page).click();
  await expect(page).toHaveURL('/settings');
});

test('opened from its icon, the app shows neither the guide nor its row', async ({ page }) => {
  await installed(page);
  await signIn(page);

  await expect(page).toHaveURL('/');
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: /Langue|Calendrier/ }).first()).toBeVisible();
  await expect(page.getByText('Installer l’app')).toHaveCount(0);
  // Its address leads home.
  await page.goto('/install-app');
  await expect(page).toHaveURL('/');
});

test.describe('on Android, when the browser offers to install', () => {
  test('"Installer l’app" opens the install window of the browser', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android', 'An event of Chrome on Android');
    await signIn(page);
    await expect(page).toHaveURL('/install-app');

    // What Chrome sends when it would install the app.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: () => {
          (window as Window & { prompted?: boolean }).prompted = true;
          return Promise.resolve();
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    await expect(page.getByText('Ton téléphone te demande ensuite de confirmer.')).toBeVisible();
    await expect(page.getByRole('list')).toHaveCount(0);
    await page.getByRole('button', { name: 'Installer l’app' }).click();
    expect(await page.evaluate(() => (window as Window & { prompted?: boolean }).prompted)).toBe(
      true,
    );
    await expect(page).toHaveURL('/');
  });
});

test.describe('on an iPhone, in another browser than Safari', () => {
  test.use({ userAgent: iPhoneChrome });

  test('says to open it in Safari, and copies the link', async ({ page, context }, testInfo) => {
    // Only Chromium lets a test allow the clipboard.
    test.skip(testInfo.project.name !== 'android', 'The clipboard of Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page);

    await expect(page).toHaveURL('/install-app');
    await expect(page.getByRole('alert')).toHaveText(
      'Sur iPhone, l’app s’installe depuis Safari, pas depuis ce navigateur.',
    );
    await expect(page.getByRole('heading', { name: 'Depuis Safari' })).toBeVisible();
    await page.getByRole('button', { name: 'Copier le lien' }).click();
    await expect(page.getByRole('button', { name: 'Lien copié' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Lien copié' })).toBeAttached();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'http://localhost:8081/',
    );
  });

  test('when the browser refuses to copy, shows the link to copy by hand', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('refused')) },
      });
    });
    await signIn(page);

    await page.getByRole('button', { name: 'Copier le lien' }).click();
    await expect(page.getByText('http://localhost:8081/', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copier le lien' })).toBeVisible();
  });
});

test.describe('on a computer', () => {
  test.use({ userAgent: macSafari });

  test('nothing is offered: Chrome and Edge offer it themselves', async ({ page }, testInfo) => {
    // A Mac has no touch screen: an iPad says it is a Mac, and has one.
    test.skip(testInfo.project.name !== 'android', 'A pointer, not a touch screen');
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
    });
    await signIn(page);

    await expect(page).toHaveURL('/');
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Mon compte' })).toBeVisible();
    await expect(page.getByText('Installer l’app')).toHaveCount(0);
  });
});

test('on an iPhone, the notifications lead to the guide', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'Safari of an iPhone');
  // Safari on an iPhone has no notification until the app is on the home screen.
  await page.addInitScript(() => {
    delete (window as Partial<Window & { PushManager: unknown }>).PushManager;
  });
  await signIn(page);
  await later(page).click();
  await page.goto('/settings/notifications');

  await page.getByRole('button', { name: 'Ajouter l’app à l’écran d’accueil' }).click();
  await expect(page).toHaveURL('/install-app');
  await expect(page.getByRole('heading', { name: 'Sur ton iPhone' })).toBeVisible();
  await later(page).click();
  await expect(page).toHaveURL('/settings/notifications');
});
