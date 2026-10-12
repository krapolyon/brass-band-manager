import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { passwordHash, sql } from './database.ts';

// Made-up band and members shared by the tests. Nobody here is real.

export const admin = {
  email: 'jb.morel@example.org',
  password: 'trombone-coulisse-42',
  lastName: 'Morel-Dubois',
  firstName: 'Jean-Baptiste',
  nickname: 'Jibé',
  instrument: 'Sax Ténor',
};

/** What the install screen sends. A test changes a copy of it to try a faulty install. */
export function installInput() {
  return {
    installKey: 'local-install-key',
    language: 'fr',
    bandName: 'La Fanfare des Cuivres Déchaînés',
    sections: [
      { name: 'Trompette', icon: 'trumpet', instruments: ['Trompette'] },
      { name: 'Saxophone', icon: 'saxophone', instruments: ['Sax Alto', 'Sax Ténor'] },
      { name: 'Souba', instruments: ['Souba'] },
    ],
    admin: { ...admin },
  };
}

/** Installs the app. The request context is then signed in as the admin. */
export async function install(request: APIRequestContext) {
  const response = await request.post('/api/install', { data: installInput() });
  if (response.status() !== 201) {
    throw new Error(`Install failed: ${response.status()} ${await response.text()}`);
  }
}

type NewMember = {
  nickname: string;
  status?: 'INVITED' | 'ACTIVE' | 'POWER_MEMBER' | 'LEFT';
  roles?: string[];
};

export const memberPassword = 'grosse-caisse-claire-7';

/** Creates a member straight in the database, on an installed app. Returns their email. */
export function addMember({ nickname, status = 'ACTIVE', roles = [] }: NewMember): string {
  const email = `${nickname.toLowerCase()}@example.org`;
  const hash = status === 'INVITED' ? 'NULL' : `'${passwordHash(memberPassword)}'`;
  const id = sql(`
    INSERT INTO member (nickname, firstName, lastName, email, instrumentId, passwordHash, status, language)
    SELECT '${nickname}', 'Prénom', 'Nom', '${email}', MIN(id), ${hash}, '${status}', 'fr' FROM instrument;
    SELECT LAST_INSERT_ID();
  `);
  for (const role of roles) {
    sql(`INSERT INTO memberRole (memberId, role) VALUES (${id}, '${role}')`);
  }
  return email;
}

export async function signIn(request: APIRequestContext, email: string, password = memberPassword) {
  return request.post('/api/session', { data: { email, password } });
}

/** The id of a member, found by their nickname. */
export function memberId(nickname: string): number {
  return Number(sql(`SELECT id FROM member WHERE nickname = '${nickname}'`));
}

/** A request context of its own (another device), signed in as a member. */
export async function deviceOf(
  playwright: PlaywrightWorkerArgs['playwright'],
  email: string,
  password = memberPassword,
) {
  const context = await playwright.request.newContext({ baseURL: 'http://localhost:8081' });
  const response = await signIn(context, email, password);
  if (response.status() !== 200) {
    throw new Error(`Sign-in failed for ${email}: ${response.status()}`);
  }
  return context;
}
