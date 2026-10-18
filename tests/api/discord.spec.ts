import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import {
  channel,
  discordAnswers,
  discordMessages,
  discordServer,
  emptyDiscord,
  forgetDiscordCache,
  onTestServer,
  otherServer,
  roles,
  server,
} from '../support/discord.ts';
import { addMember, admin, deviceOf, install } from '../support/scenario.ts';
import { addSong } from '../support/songFiles.ts';

// Discord (0.3.0, issue #33): the server of the band, the bot that reads, the
// role of each section, the messages of the channel of a song that tag the
// section of the member. Rules: model/band.md ("Discord"), model/members.md
// (section.discordRoleId), model/songs.md ("Display"). The test server reads
// a made-up Discord from files (tests/support/discord.ts).

// The band: Jibé the admin (Sax Ténor, section Saxophone), Zaza (Trompette),
// Momo who manages members, Sisi who manages songs.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyDiscord();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
  addMember({ nickname: 'Sisi', roles: ['SONG_MANAGER', 'GIG_MANAGER', 'SETLIST_MANAGER'] });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const sectionId = (name: string) => Number(sql(`SELECT id FROM section WHERE name = '${name}'`));
const link = `https://discord.com/channels/${server}/${channel}`;

test.describe('the settings of the band', () => {
  test('without a server: the bot of the instance is said, no role is read', async ({
    playwright,
  }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    const settings = await (await jibe.get('/api/band/discord')).json();

    expect(settings).toEqual({
      serverId: null,
      // The test server has a token; the token itself is never sent.
      hasBot: true,
      bot: 'none',
      serverName: null,
      roles: null,
      sections: [
        { id: sectionId('Trompette'), name: 'Trompette', icon: 'trumpet', discordRoleId: null },
        { id: sectionId('Saxophone'), name: 'Saxophone', icon: 'saxophone', discordRoleId: null },
        { id: sectionId('Souba'), name: 'Souba', icon: null, discordRoleId: null },
      ],
    });
    expect(JSON.stringify(settings)).not.toContain('test-only');
  });

  test('the server is read from the link of any of its channels; the bot reaches it and lists its roles', async ({
    playwright,
  }) => {
    discordServer();
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    const saved = await jibe.put('/api/band/discord', { data: { link: ` ${link} ` } });

    expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({
      serverId: server,
      bot: 'connected',
      serverName: 'Les Cuivres',
      // Neither @everyone nor the role Discord made for the bot; the highest first.
      roles: [
        { id: roles.saxophones, name: 'saxophoniste' },
        { id: roles.trumpets, name: 'trompettiste' },
        { id: roles.board, name: 'bureau' },
      ],
    });
    expect(sql('SELECT discordServerId, updatedByMemberId IS NOT NULL FROM band')).toBe(
      `${server}\t1`,
    );
    // The identifier alone is a server too.
    const alone = await jibe.put('/api/band/discord', { data: { link: server } });
    expect((await alone.json()).serverId).toBe(server);
  });

  test('a bot the server refuses, or a Discord that does not answer, is said; the links stay', async ({
    playwright,
  }) => {
    sql(`UPDATE band SET discordServerId = '${server}'`);
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    discordAnswers(`/guilds/${server}`, { message: 'Missing Access' }, 403);
    expect(await (await jibe.get('/api/band/discord')).json()).toMatchObject({
      serverId: server,
      bot: 'refused',
      roles: null,
    });
    // Nothing written for this server: Discord says it does not know it.
    emptyDiscord();
    expect((await (await jibe.get('/api/band/discord')).json()).bot).toBe('refused');
  });

  test('a link that is not one of Discord is refused, and nothing changes', async ({
    playwright,
  }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    for (const typed of [
      'https://example.org/channels/1/2',
      'Les Cuivres',
      `http://discord.com/channels/${server}`,
    ]) {
      const refused = await jibe.put('/api/band/discord', { data: { link: typed } });
      expect(await refused.json(), typed).toEqual({
        error: 'invalidInput',
        fields: { link: 'invalid' },
      });
    }
    expect(sql('SELECT discordServerId IS NULL FROM band')).toBe('1');
  });

  test('an admin gives each section a role of the server; one role tags one section', async ({
    playwright,
  }) => {
    discordServer();
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    await jibe.put('/api/band/discord', { data: { link } });

    const saved = await jibe.put('/api/band/discord', {
      data: {
        link,
        sectionRoles: [
          { sectionId: sectionId('Trompette'), discordRoleId: roles.trumpets },
          { sectionId: sectionId('Saxophone'), discordRoleId: roles.saxophones },
          { sectionId: sectionId('Souba'), discordRoleId: null },
        ],
      },
    });
    expect(
      (await saved.json()).sections.map((one: { discordRoleId: string }) => one.discordRoleId),
    ).toEqual([roles.trumpets, roles.saxophones, null]);

    // Two sections swap their roles in one save.
    const swapped = await jibe.put('/api/band/discord', {
      data: {
        link,
        sectionRoles: [
          { sectionId: sectionId('Trompette'), discordRoleId: roles.saxophones },
          { sectionId: sectionId('Saxophone'), discordRoleId: roles.trumpets },
        ],
      },
    });
    expect(swapped.status()).toBe(200);

    const twice = await jibe.put('/api/band/discord', {
      data: {
        link,
        sectionRoles: [
          { sectionId: sectionId('Trompette'), discordRoleId: roles.board },
          { sectionId: sectionId('Souba'), discordRoleId: roles.board },
        ],
      },
    });
    expect(await twice.json()).toEqual({
      error: 'invalidInput',
      fields: { 'sectionRoles.1': 'duplicate' },
    });
    for (const faulty of [
      { sectionId: 9999, discordRoleId: roles.board },
      { sectionId: sectionId('Souba'), discordRoleId: '@bureau' },
    ]) {
      const refused = await jibe.put('/api/band/discord', {
        data: { link, sectionRoles: [faulty] },
      });
      expect((await refused.json()).fields).toEqual({ 'sectionRoles.0': 'invalid' });
    }
    expect(() => sql(`UPDATE section SET discordRoleId = 'bureau'`)).toThrow();

    // Another server, or none: the roles of the first one tag nothing.
    await jibe.put('/api/band/discord', {
      data: { link: `https://discord.com/channels/${otherServer}/${channel}` },
    });
    expect(sql('SELECT COUNT(*) FROM section WHERE discordRoleId IS NOT NULL')).toBe('0');
  });

  test('only an admin reads or changes them', async ({ playwright, request }) => {
    expect((await request.get('/api/band/discord')).status()).toBe(401);
    expect((await request.put('/api/band/discord', { data: { link } })).status()).toBe(401);
    for (const nickname of ['Zaza', 'Momo', 'Sisi']) {
      const member = await deviceOf(playwright, email(nickname));
      expect((await member.get('/api/band/discord')).status(), nickname).toBe(403);
      expect((await member.put('/api/band/discord', { data: { link } })).status(), nickname).toBe(
        403,
      );
    }
    expect(sql('SELECT discordServerId IS NULL FROM band')).toBe('1');
  });
});

test.describe('the messages of the channel of a song', () => {
  // A song with a channel, the roles of the two sections, and the channel
  // holding messages for both, the latest first.
  function aSongWithItsChannel(): number {
    discordServer();
    sql(`UPDATE band SET discordServerId = '${server}'`);
    sql(`UPDATE section SET discordRoleId = '${roles.saxophones}' WHERE name = 'Saxophone'`);
    sql(`UPDATE section SET discordRoleId = '${roles.trumpets}' WHERE name = 'Trompette'`);
    const songId = addSong('Seven Nation');
    sql(`UPDATE song SET discordChannelId = '${channel}' WHERE id = ${songId}`);
    discordMessages(channel, [
      {
        id: '9005',
        author: 'Fanfan',
        day: '2026-10-01',
        content: `<@&${roles.saxophones}> mesures 36-37, à la fin du thème 1 :custom: <a:fire:123>`,
        roles: [roles.saxophones],
      },
      {
        id: '9004',
        author: 'Lulu',
        day: '2026-09-28',
        content: `<@&${roles.trumpets}> on reprend le pont`,
        roles: [roles.trumpets],
      },
      {
        id: '9003',
        author: 'Zaza',
        day: '2026-09-12',
        content: `<@&${roles.saxophones}> <@&${roles.trumpets}> révisez la lettre C`,
        roles: [roles.saxophones, roles.trumpets],
      },
      {
        id: '9002',
        author: 'Kiki',
        day: '2026-09-01',
        content: 'Répète jeudi, sans tag',
        roles: [],
      },
      {
        id: '9001',
        author: 'Gégé',
        day: '2026-08-20',
        content: `<@&${roles.saxophones}> nouvelle partition`,
        roles: [roles.saxophones],
      },
      {
        id: '9000',
        author: 'Nono',
        day: '2026-08-02',
        content: `<@&${roles.saxophones}> la plus ancienne`,
        roles: [roles.saxophones],
      },
    ]);
    return songId;
  }

  test('a member sees the three latest messages that tag their section, the latest first, each with its link', async ({
    playwright,
  }) => {
    const songId = aSongWithItsChannel();
    // Jibé plays the Sax Ténor: the Saxophone section.
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    const answer = await (await jibe.get(`/api/songs/${songId}/discord`)).json();

    expect(answer).toEqual({
      roleName: 'saxophoniste',
      messages: [
        {
          id: '9005',
          author: 'Fanfan',
          postedAt: '2026-10-01T18:30:00.000000+00:00',
          // The mentions as Discord shows them; custom emoji by their name.
          text: '@saxophoniste mesures 36-37, à la fin du thème 1 :custom: :fire:',
          url: `https://discord.com/channels/${server}/${channel}/9005`,
        },
        expect.objectContaining({
          id: '9003',
          author: 'Zaza',
          text: '@saxophoniste @trompettiste révisez la lettre C',
        }),
        expect.objectContaining({ id: '9001', author: 'Gégé' }),
      ],
    });

    // Zaza plays the trumpet: the messages of her section.
    const zaza = await deviceOf(playwright, email('Zaza'));
    const hers = await (await zaza.get(`/api/songs/${songId}/discord`)).json();
    expect(hers.roleName).toBe('trompettiste');
    expect(hers.messages.map((message: { id: string }) => message.id)).toEqual(['9004', '9003']);
  });

  test('what Discord answered is kept a while, never in the database', async ({ playwright }) => {
    const songId = aSongWithItsChannel();
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    await jibe.get(`/api/songs/${songId}/discord`);

    // A new message, unseen until what was kept is forgotten (10 minutes).
    discordMessages(channel, [
      {
        id: '9100',
        author: 'Fifi',
        day: '2026-10-10',
        content: `<@&${roles.saxophones}> nouveau`,
        roles: [roles.saxophones],
      },
    ]);
    expect((await (await jibe.get(`/api/songs/${songId}/discord`)).json()).messages[0].id).toBe(
      '9005',
    );
    forgetDiscordCache();
    expect((await (await jibe.get(`/api/songs/${songId}/discord`)).json()).messages[0].id).toBe(
      '9100',
    );

    const tables = sql(
      "SELECT GROUP_CONCAT(table_name) FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name LIKE '%essage%'",
    );
    expect(tables).toBe('NULL');
  });

  test('no role for the section, no channel, no server, a channel the bot cannot see, too many requests: no message, never an error', async ({
    playwright,
  }) => {
    const songId = aSongWithItsChannel();
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    // Nothing is known: no role named either, so the screen says nothing
    // false ("nobody has tagged you") and shows the button alone.
    const nothing = async () => {
      forgetDiscordCache();
      const response = await jibe.get(`/api/songs/${songId}/discord`);
      expect(response.status()).toBe(200);
      return response.json();
    };

    // The roles unknown while the messages come: the messages are not shown
    // under a sentence that says there is nothing.
    discordAnswers(`/guilds/${server}/roles`, { retry_after: 2.5 }, 429);
    expect(await nothing()).toEqual({ roleName: null, messages: [] });
    discordServer();

    discordAnswers(`/channels/${channel}/messages`, { message: 'Missing Access' }, 403);
    expect(await nothing()).toEqual({ roleName: null, messages: [] });
    discordAnswers(`/channels/${channel}/messages`, { retry_after: 2.5 }, 429);
    expect(await nothing()).toEqual({ roleName: null, messages: [] });

    sql(`UPDATE section SET discordRoleId = NULL WHERE name = 'Saxophone'`);
    expect(await nothing()).toEqual({ roleName: null, messages: [] });

    sql(`UPDATE song SET discordChannelId = NULL`);
    expect(await nothing()).toEqual({ roleName: null, messages: [] });

    sql(`UPDATE band SET discordServerId = NULL`);
    expect(await nothing()).toEqual({ roleName: null, messages: [] });
  });

  test('what was kept is erased once its time is past, and a folder the app did not make is not used', async ({
    playwright,
  }) => {
    const songId = aSongWithItsChannel();
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    await jibe.get(`/api/songs/${songId}/discord`);
    const folder = onTestServer('ls -d /tmp/brassBandDiscord-*').trim();
    expect(folder).not.toBe('');

    // An answer past its time is erased on the next request, not only skipped.
    onTestServer(`echo "{}" > ${folder}/old.json && touch -d @1 ${folder}/old.json`);
    await jibe.get(`/api/songs/${songId}/discord`);
    expect(onTestServer(`ls ${folder}`)).not.toContain('old.json');

    // A folder of that name made by someone else, open to all: nothing is
    // kept in it nor read from it.
    onTestServer(`rm -rf ${folder} && mkdir -m 777 ${folder}`);
    await jibe.get(`/api/songs/${songId}/discord`);
    expect(onTestServer(`ls -A ${folder}`).trim()).toBe('');
    discordMessages(channel, [
      {
        id: '9200',
        author: 'Fifi',
        day: '2026-10-12',
        content: `<@&${roles.saxophones}> tout de suite`,
        roles: [roles.saxophones],
      },
    ]);
    expect((await (await jibe.get(`/api/songs/${songId}/discord`)).json()).messages[0].id).toBe(
      '9200',
    );
    onTestServer(`rm -rf ${folder}`);
  });

  test('for members only, and an unknown song is not found', async ({ playwright, request }) => {
    const songId = aSongWithItsChannel();
    expect((await request.get(`/api/songs/${songId}/discord`)).status()).toBe(401);
    const zaza = await deviceOf(playwright, email('Zaza'));
    expect((await zaza.get('/api/songs/9999/discord')).status()).toBe(404);
  });
});

test('the summary of the band settings asks whether a server is set, without asking Discord', async ({
  playwright,
}) => {
  sql(`UPDATE band SET discordServerId = '${server}'`);
  discordAnswers(`/guilds/${server}`, { message: 'Missing Access' }, 403);
  const jibe = await deviceOf(playwright, admin.email, admin.password);

  const summary = await (await jibe.get('/api/band/discord?withoutBot')).json();

  expect(summary).toMatchObject({ serverId: server, bot: 'none', roles: null });
});
