import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addMember, admin, install, memberId, signIn } from '../support/scenario.ts';

// The ten accent themes of 0.4.0 (issue #58; model/band.md "Default accent
// theme", model/members.md `accentTheme`) and the migration that moves the
// four keys of before to their new names.

const themes = [
  'brass',
  'tangerine',
  'raspberry',
  'orchid',
  'cornflower',
  'azure',
  'lagoon',
  'emerald',
  'lime',
  'ivory',
];

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
});

test('a member chooses any of the ten themes, and none of the four of before', async ({
  request,
}) => {
  await signIn(request, addMember({ nickname: 'Zaza' }));
  const preferences = (accentTheme: string) =>
    request.put('/api/me/preferences', {
      data: {
        language: 'fr',
        colorScheme: 'DARK',
        accentTheme,
        hasHighContrast: false,
        hasIncreasedSpacing: false,
        hasLegibleFont: false,
        hasReducedMotion: false,
        hasExtendedTimeouts: false,
      },
    });

  for (const theme of themes) {
    expect((await preferences(theme)).status(), theme).toBe(200);
  }
  for (const former of ['copper', 'coral', 'mint', 'lilac']) {
    const response = await preferences(former);
    expect(response.status(), former).toBe(422);
    expect((await response.json()).fields).toEqual({ accentTheme: 'invalid' });
  }
});

test('an admin gives the band any of the ten themes, and none of the four of before', async ({
  request,
}) => {
  await signIn(request, admin.email, admin.password);
  for (const theme of themes) {
    const response = await request.patch('/api/band', { data: { defaultAccentTheme: theme } });
    expect(response.status(), theme).toBe(200);
  }
  const response = await request.patch('/api/band', { data: { defaultAccentTheme: 'copper' } });
  expect(response.status()).toBe(422);
  expect(sql('SELECT defaultAccentTheme FROM band')).toBe('ivory');
});

test.describe('the database update of 0.4.0', () => {
  // As on a database of 0.3.2: the migration not applied yet, the four keys
  // of before stored. Undone by the update itself.
  const asBefore = () => {
    sql(`
      ALTER TABLE band DROP CHECK bandSetlistTargetRange, DROP COLUMN setlistTargetMinutes;
      ALTER TABLE band ALTER COLUMN defaultAccentTheme DROP DEFAULT;
      ALTER TABLE member ALTER COLUMN colorScheme SET DEFAULT 'AUTO';
      DELETE FROM schemaMigration WHERE name = '017_setlistTargetAndAccentThemes.sql';
    `);
  };
  const update = () =>
    execFileSync(
      'docker',
      ['compose', 'exec', '-T', 'web-test', 'php', '/var/www/database/migrate.php'],
      { stdio: 'ignore' },
    );

  test('moves each former key to its new name, and leaves the others', () => {
    addMember({ nickname: 'Zaza' });
    addMember({ nickname: 'Momo' });
    addMember({ nickname: 'Riri' });
    addMember({ nickname: 'Fifi' });
    addMember({ nickname: 'Lulu' });
    addMember({ nickname: 'Nono' });
    // The rows are encrypted first, as on a database of 0.3.2, so that the
    // update below writes only what this migration changes.
    update();
    asBefore();
    sql(`
      UPDATE band SET defaultAccentTheme = 'coral';
      UPDATE member SET accentTheme = 'copper' WHERE nickname = 'Zaza';
      UPDATE member SET accentTheme = 'mint' WHERE nickname = 'Momo';
      UPDATE member SET accentTheme = 'lilac' WHERE nickname = 'Riri';
      UPDATE member SET accentTheme = 'emerald' WHERE nickname = 'Fifi';
      UPDATE member SET accentTheme = NULL WHERE nickname = 'Lulu';
      UPDATE member SET accentTheme = 'coral', colorScheme = 'LIGHT' WHERE nickname = 'Nono';
    `);
    const updatedAt = sql(`SELECT updatedAt FROM member WHERE nickname = 'Zaza'`);

    update();

    expect(sql('SELECT defaultAccentTheme, setlistTargetMinutes FROM band')).toBe('tangerine\t45');
    const themeOf = (nickname: string) =>
      sql(`SELECT IFNULL(accentTheme, '-') FROM member WHERE id = ${memberId(nickname)}`);
    expect(themeOf('Zaza')).toBe('brass');
    expect(themeOf('Momo')).toBe('lagoon');
    expect(themeOf('Riri')).toBe('orchid');
    expect(themeOf('Fifi')).toBe('emerald');
    expect(themeOf('Lulu')).toBe('-');
    expect(themeOf('Nono')).toBe('tangerine');
    // A member who chose keeps their scheme; the move is not a change made by them.
    expect(sql(`SELECT colorScheme FROM member WHERE nickname = 'Nono'`)).toBe('LIGHT');
    expect(sql(`SELECT updatedAt FROM member WHERE nickname = 'Zaza'`)).toBe(updatedAt);
  });

  test('runs on an instance that holds none of the former keys', () => {
    asBefore();
    sql(`UPDATE band SET defaultAccentTheme = 'lime'`);

    update();

    expect(sql('SELECT defaultAccentTheme FROM band')).toBe('lime');
  });

  test('a new member starts in the dark scheme, and the band in brass', () => {
    addMember({ nickname: 'Zaza' });
    expect(sql(`SELECT colorScheme FROM member WHERE nickname = 'Zaza'`)).toBe('DARK');
    expect(
      sql(`SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'band' AND COLUMN_NAME = 'defaultAccentTheme'`),
    ).toBe('brass');
  });
});
