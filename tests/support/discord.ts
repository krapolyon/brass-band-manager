import { execFileSync } from 'node:child_process';

// Discord on the test server: a folder of answers the tests write
// (docker-compose.yml, BRASS_BAND_DISCORD_ANSWERS), read by the server in the
// place of the API of Discord (api/src/Discord/Discord.php). Nothing is ever
// asked of Discord. The servers, channels, roles and people are made up.

const ANSWERS = '/var/www/storage/discordAnswers';
/** Runs a shell command on the test server, as root. */
export const onTestServer = (script: string, input?: string) =>
  execFileSync('docker', ['compose', 'exec', '-T', 'web-test', 'sh', '-c', script], {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
  });

export const server = '1000312294715883560';
export const otherServer = '1000999999999999999';
export const channel = '1000359811281600622';
export const roles = {
  saxophones: '1100458311290118204',
  trumpets: '1100458311290118205',
  board: '1100458311290118206',
};

/** Forgets every answer, and what the server kept of the earlier ones. */
export function emptyDiscord(): void {
  onTestServer(`rm -rf ${ANSWERS} /tmp/brassBandDiscord-*`);
}

/** Forgets what the server kept, as 10 minutes later. */
export function forgetDiscordCache(): void {
  onTestServer('rm -rf /tmp/brassBandDiscord-*');
}

/**
 * What Discord answers for a path of its API, as "/guilds/<id>/roles". A
 * status other than 200 is a refusal: 403 for a channel the bot cannot see,
 * 429 for too many requests.
 */
export function discordAnswers(path: string, body: unknown, status = 200): void {
  const file = `${ANSWERS}/${path.replace(/^\//, '')}.json`;
  onTestServer(
    `mkdir -p "$(dirname '${file}')" && cat > '${file}'`,
    JSON.stringify(status === 200 ? body : { status, body }),
  );
}

/** The server of the band, as the bot sees it, with its roles. */
export function discordServer(name = 'Les Cuivres'): void {
  discordAnswers(`/guilds/${server}`, { id: server, name });
  discordAnswers(`/guilds/${server}/roles`, [
    { id: server, name: '@everyone', position: 0 },
    { id: roles.board, name: 'bureau', position: 1 },
    { id: roles.trumpets, name: 'trompettiste', position: 2 },
    { id: roles.saxophones, name: 'saxophoniste', position: 3 },
    { id: '1100458311290118299', name: 'App Les Cuivres', position: 4, managed: true },
  ]);
}

type Message = { id: string; author: string; day: string; content: string; roles: string[] };

/** The last messages of a channel, as Discord gives them: the latest first. */
export function discordMessages(channelId: string, messages: Message[]): void {
  discordAnswers(
    `/channels/${channelId}/messages`,
    messages.map((message) => ({
      id: message.id,
      timestamp: `${message.day}T18:30:00.000000+00:00`,
      content: message.content,
      author: { id: '42', username: message.author.toLowerCase(), global_name: message.author },
      mention_roles: message.roles,
      mentions: [],
    })),
  );
}
