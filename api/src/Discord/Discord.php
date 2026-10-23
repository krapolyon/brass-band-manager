<?php

declare(strict_types=1);

namespace BrassBand\Discord;

// What the app asks Discord, through the bot of the band: whether it reaches
// the server, who the app is there (the bot and its role), the roles of the
// server, the last messages of a channel that tag the app. Rules:
// model/band.md ("Discord"), model/songs.md ("Display"), model/gigs.md
// ("Discord on a gig"); how to create the bot: docs/discord-bot.md.
//
// The bot only reads, through the REST API: it never connects to the gateway,
// which a host without a long-running process could not keep open. Its token
// is in config.php (discord.botToken), never in the database, never sent to
// the front, never logged.
//
// What Discord answers is kept 10 minutes in the temporary folder of the
// server, never in the database: the messages belong to Discord (model,
// principle "What an outside service says is not stored"). An answer past
// its time is erased at the next request, and the folder is used only when
// this app made it, for itself alone. Any refusal or
// delay (no token, a channel the bot cannot see, too many requests) reads as
// "nothing": the screens then show the link of the channel only.
final class Discord
{
    // The version the documentation of Discord gives as current (checked on
    // 2026-10-18: 10, with 9 still available).
    private const API = 'https://discord.com/api/v10';
    private const CACHE_SECONDS = 600;
    // After a refusal, Discord is not asked again for a minute.
    private const FAILURE_SECONDS = 60;
    private const TIMEOUT_SECONDS = 4;
    // The most Discord gives in one request, and what the model reads.
    public const MESSAGE_COUNT = 100;

    private readonly string $cacheFolder;

    /**
     * @param \Closure(string): (array{status: int, body: mixed}|null)|null $transport Asks Discord a path; given by the tests
     */
    public function __construct(
        private readonly string $botToken,
        string $instanceKey,
        private readonly ?\Closure $transport = null,
    ) {
        // One folder per instance: two apps of one host never read each
        // other's answers.
        $this->cacheFolder = sys_get_temp_dir() . '/brassBandDiscord-' . substr(hash('sha256', $instanceKey), 0, 16);
    }

    /**
     * @param array<string, mixed> $config The configuration of the app: discord.botToken, and discord.answersFrom on the test server
     */
    public static function from(array $config): self
    {
        $discord = is_array($config['discord'] ?? null) ? $config['discord'] : [];
        $token = is_string($discord['botToken'] ?? null) ? trim($discord['botToken']) : '';
        $folder = is_string($discord['answersFrom'] ?? null) ? $discord['answersFrom'] : '';
        $storage = is_string($config['storageFolder'] ?? null) ? $config['storageFolder'] : '';
        // The test server reads its answers from files (docker-compose.yml):
        // the tests ask nothing of Discord.
        $transport = $folder === '' ? null : static function (string $path) use ($folder): array {
            // "/channels/1/messages?limit=100" is the file channels/1/messages.json.
            $file = $folder . '/' . trim((string) strtok($path, '?'), '/') . '.json';
            if (!is_file($file)) {
                return ['status' => 404, 'body' => null];
            }
            $answer = json_decode((string) file_get_contents($file), true);

            return is_array($answer) && isset($answer['status']) && is_int($answer['status'])
                ? ['status' => $answer['status'], 'body' => $answer['body'] ?? null]
                : ['status' => 200, 'body' => $answer];
        };

        return new self($token, $storage, $transport);
    }

    // True when the instance has a bot: a token in its configuration.
    public function hasBot(): bool
    {
        return $this->botToken !== '';
    }

    /**
     * Whether the bot reaches a server, and its name.
     *
     * @return array{status: 'none'|'connected'|'refused'|'unreachable', serverName: string|null}
     */
    public function server(string $serverId): array
    {
        if (!$this->hasBot()) {
            return ['status' => 'none', 'serverName' => null];
        }
        $answer = $this->ask("/guilds/{$serverId}", fresh: true);
        if ($answer === null) {
            return ['status' => 'unreachable', 'serverName' => null];
        }
        if ($answer['status'] !== 200 || !is_array($answer['body'])) {
            return ['status' => 'refused', 'serverName' => null];
        }
        $name = $answer['body']['name'] ?? null;

        return ['status' => 'connected', 'serverName' => is_string($name) ? $name : null];
    }

    /**
     * The roles of a server a section can be tagged with, in the order of
     * Discord: not @everyone, nor a role Discord manages for a bot.
     *
     * @return list<array{id: string, name: string}>|null Null when Discord does not answer
     */
    public function roles(string $serverId, bool $fresh = false): ?array
    {
        $all = $this->serverRoles($serverId, $fresh);
        if ($all === null) {
            return null;
        }
        $roles = array_values(array_filter(
            $all,
            fn (array $role) => $role['id'] !== $serverId && !$role['managed'],
        ));
        // The highest role first, as Discord lists them.
        usort($roles, fn (array $one, array $other) => $other['position'] <=> $one['position']);

        return array_map(fn (array $role) => ['id' => $role['id'], 'name' => $role['name']], $roles);
    }

    /**
     * Who the app is on Discord (issue #45): the bot itself (GET /users/@me),
     * its name, and the role Discord gave it when it joined the server (the
     * role it manages, tagged with the id of the bot), or null. A member tags
     * the app by either. Nothing is typed in the settings: Discord says it.
     *
     * @return array{userId: string, name: string, roleId: string|null}|null Null when Discord does not say
     */
    public function app(string $serverId, bool $fresh = false): ?array
    {
        $answer = $this->hasBot() ? $this->ask('/users/@me', $fresh) : null;
        if ($answer === null || $answer['status'] !== 200 || !is_array($answer['body']) || !is_string($answer['body']['id'] ?? null)) {
            return null;
        }
        $userId = $answer['body']['id'];
        $roleId = null;
        foreach ($this->serverRoles($serverId, $fresh) ?? [] as $role) {
            if ($role['botId'] === $userId) {
                $roleId = $role['id'];
                break;
            }
        }

        return ['userId' => $userId, 'name' => self::nameOf($answer['body']), 'roleId' => $roleId];
    }

    /**
     * The messages of a channel that are meant for the app, as a sheet shows
     * them, all of them, the latest first (issue #45): those that tag the app
     * (the bot or its role) and, when a role is given, that role too (the
     * section of the member, on a song). The tag of the app is taken out of
     * the text. Null when nothing is known: Discord does not say who the app
     * is, or does not give the roles or the messages.
     *
     * @return list<array{id: string, author: string, postedAt: string, text: string, url: string}>|null
     */
    public function messagesForApp(string $serverId, string $channelId, ?string $roleId = null): ?array
    {
        $app = $this->app($serverId);
        $roles = $app === null ? null : $this->serverRoles($serverId);
        $messages = $roles === null ? null : $this->messages($channelId);
        if ($app === null || $roles === null || $messages === null) {
            return null;
        }
        $roleNames = [];
        foreach ($roles as $role) {
            $roleNames[$role['id']] = $role['name'];
        }

        $shown = [];
        foreach ($messages as $message) {
            $tagsApp = array_key_exists($app['userId'], $message['mentions'])
                || ($app['roleId'] !== null && in_array($app['roleId'], $message['mentionRoles'], true));
            if (!$tagsApp || ($roleId !== null && !in_array($roleId, $message['mentionRoles'], true))) {
                continue;
            }
            $shown[] = [
                'id' => $message['id'],
                // The name the author shows on Discord: shown, never stored.
                'author' => $message['author'],
                'postedAt' => $message['postedAt'],
                'text' => self::readable(self::withoutApp($message['content'], $app), $roleNames, $message['mentions']),
                'url' => DiscordLinks::messageUrl($serverId, $channelId, $message['id']),
            ];
        }

        return $shown;
    }

    /**
     * Every role of a server, as Discord gives it: @everyone and the roles it
     * manages included, with the bot a managed role belongs to.
     *
     * @return list<array{id: string, name: string, position: int, managed: bool, botId: string|null}>|null Null when Discord does not answer
     */
    private function serverRoles(string $serverId, bool $fresh = false): ?array
    {
        $answer = $this->hasBot() ? $this->ask("/guilds/{$serverId}/roles", $fresh) : null;
        if ($answer === null || $answer['status'] !== 200 || !is_array($answer['body'])) {
            return null;
        }
        $roles = [];
        foreach ($answer['body'] as $role) {
            if (!is_array($role) || !is_string($role['id'] ?? null) || !is_string($role['name'] ?? null)) {
                continue;
            }
            $tags = is_array($role['tags'] ?? null) ? $role['tags'] : [];
            $roles[] = [
                'id' => $role['id'],
                'name' => $role['name'],
                'position' => (int) ($role['position'] ?? 0),
                'managed' => ($role['managed'] ?? false) === true,
                'botId' => is_string($tags['bot_id'] ?? null) ? $tags['bot_id'] : null,
            ];
        }

        return $roles;
    }

    /**
     * The text of a message without the tag of the app, which says nothing to
     * a member who reads it in the app.
     *
     * @param array{userId: string, roleId: string|null} $app
     */
    private static function withoutApp(string $content, array $app): string
    {
        $content = preg_replace('/[ \t]*<@!?' . preg_quote($app['userId'], '/') . '>/', '', $content) ?? $content;
        if ($app['roleId'] !== null) {
            $content = preg_replace('/[ \t]*<@&' . preg_quote($app['roleId'], '/') . '>/', '', $content) ?? $content;
        }

        return $content;
    }

    /**
     * The last messages of a channel, the latest first, as Discord wrote
     * them. Null when Discord does not answer.
     *
     * @return list<array{id: string, author: string, postedAt: string, content: string, mentionRoles: list<string>, mentions: array<string, string>}>|null
     */
    private function messages(string $channelId): ?array
    {
        $answer = $this->hasBot() ? $this->ask("/channels/{$channelId}/messages?limit=" . self::MESSAGE_COUNT) : null;
        if ($answer === null || $answer['status'] !== 200 || !is_array($answer['body'])) {
            return null;
        }
        $messages = [];
        foreach ($answer['body'] as $message) {
            if (!is_array($message) || !is_string($message['id'] ?? null) || !is_string($message['timestamp'] ?? null)) {
                continue;
            }
            $author = is_array($message['author'] ?? null) ? $message['author'] : [];
            $mentions = [];
            foreach (is_array($message['mentions'] ?? null) ? $message['mentions'] : [] as $user) {
                if (is_array($user) && is_string($user['id'] ?? null)) {
                    $mentions[$user['id']] = self::nameOf($user);
                }
            }
            $messages[] = [
                'id' => $message['id'],
                'author' => self::nameOf($author),
                'postedAt' => $message['timestamp'],
                'content' => is_string($message['content'] ?? null) ? $message['content'] : '',
                'mentionRoles' => array_values(array_filter(
                    is_array($message['mention_roles'] ?? null) ? $message['mention_roles'] : [],
                    'is_string',
                )),
                'mentions' => $mentions,
            ];
        }
        // Discord gives the latest first; a sort keeps it so whatever comes.
        usort($messages, fn (array $one, array $other) => strcmp($other['postedAt'], $one['postedAt']));

        return $messages;
    }

    /**
     * The text of a message as the sheet shows it: the mentions of roles,
     * and members written as Discord shows them, the custom emoji by their
     * name. A mention the app cannot name keeps its sign alone: the server
     * writes no word of its own.
     *
     * @param array<string, string> $roleNames Id => name
     * @param array<string, string> $members Id => name
     */
    private static function readable(string $content, array $roleNames, array $members): string
    {
        $content = preg_replace_callback('/<@&([0-9]+)>/', fn (array $found) => '@' . ($roleNames[$found[1]] ?? '…'), $content) ?? $content;
        $content = preg_replace_callback('/<@!?([0-9]+)>/', fn (array $found) => '@' . ($members[$found[1]] ?? '…'), $content) ?? $content;
        $content = preg_replace('/<#[0-9]+>/', '#…', $content) ?? $content;
        $content = preg_replace('/<a?(:[A-Za-z0-9_]+:)[0-9]+>/', '$1', $content) ?? $content;

        return trim($content);
    }

    /**
     * @param array<mixed> $user
     */
    private static function nameOf(array $user): string
    {
        foreach (['global_name', 'username'] as $key) {
            if (is_string($user[$key] ?? null) && trim($user[$key]) !== '') {
                return trim($user[$key]);
            }
        }

        return '?';
    }

    /**
     * Asks Discord a path, through the cache. Null when Discord did not
     * answer in time, or refused recently.
     *
     * @param bool $fresh Asks Discord again, whatever the cache holds: the settings say what is true now
     * @return array{status: int, body: mixed}|null
     */
    private function ask(string $path, bool $fresh = false): ?array
    {
        $isKept = $this->ownFolder();
        if ($isKept) {
            $this->eraseOld();
        }
        $file = $this->cacheFolder . '/' . hash('sha256', $path) . '.json';
        $cached = $fresh || !$isKept ? null : $this->cached($file);
        if ($cached !== null) {
            return $cached['answer'];
        }

        $answer = $this->transport !== null ? ($this->transport)($path) : $this->request($path);
        if ($isKept) {
            $this->keep($file, $answer);
        }

        return $answer;
    }

    /**
     * True when the folder of the cache is this app's alone: made now if it
     * is missing, refused when another account made it or anyone can open it
     * (its name can be guessed, and the temporary folder of a host can be
     * shared). Then nothing is kept and Discord is asked each time.
     */
    private function ownFolder(): bool
    {
        if (!is_dir($this->cacheFolder) && !@mkdir($this->cacheFolder, 0o700, true)) {
            return false;
        }
        clearstatcache(true, $this->cacheFolder);
        $owner = @fileowner($this->cacheFolder);
        $mode = @fileperms($this->cacheFolder);
        if ($owner === false || $mode === false || ($mode & 0o077) !== 0) {
            return false;
        }

        return !function_exists('posix_geteuid') || $owner === posix_geteuid();
    }

    // Erases the answers past their time, so that the messages of a channel
    // nobody opens again do not stay on the server.
    private function eraseOld(): void
    {
        $limit = time() - self::CACHE_SECONDS;
        foreach (glob($this->cacheFolder . '/*.json') ?: [] as $file) {
            $writtenAt = @filemtime($file);
            if ($writtenAt !== false && $writtenAt < $limit) {
                @unlink($file);
            }
        }
    }

    /**
     * @return array{answer: array{status: int, body: mixed}|null}|null
     */
    private function cached(string $file): ?array
    {
        $kept = is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
        if (!is_array($kept) || !is_int($kept['until'] ?? null) || $kept['until'] < time()) {
            return null;
        }
        $answer = $kept['answer'] ?? null;

        return ['answer' => is_array($answer) && is_int($answer['status'] ?? null) ? ['status' => $answer['status'], 'body' => $answer['body'] ?? null] : null];
    }

    /**
     * @param array{status: int, body: mixed}|null $answer
     */
    private function keep(string $file, ?array $answer): void
    {
        // What Discord gave is kept 10 minutes; a refusal or a silence one.
        $seconds = $answer !== null && $answer['status'] === 200 ? self::CACHE_SECONDS : self::FAILURE_SECONDS;
        // Only this app reads it: the folder of a shared host can be shared.
        if (@file_put_contents($file, json_encode(['until' => time() + $seconds, 'answer' => $answer]), LOCK_EX) !== false) {
            @chmod($file, 0o600);
        }
    }

    /**
     * @return array{status: int, body: mixed}|null
     */
    private function request(string $path): ?array
    {
        try {
            $client = new \GuzzleHttp\Client([
                'timeout' => self::TIMEOUT_SECONDS,
                'connect_timeout' => self::TIMEOUT_SECONDS,
                'http_errors' => false,
                'allow_redirects' => false,
            ]);
            $response = $client->request('GET', self::API . $path, [
                'headers' => [
                    'Authorization' => "Bot {$this->botToken}",
                    // The form Discord asks for, without which it may refuse.
                    'User-Agent' => 'DiscordBot (https://github.com/krapolyon/brass-band-manager, 0.3)',
                    'Accept' => 'application/json',
                ],
            ]);
        } catch (\Throwable) {
            // Nothing is logged: the address names a channel, the answer its messages.
            return null;
        }
        $body = json_decode((string) $response->getBody(), true);

        return ['status' => $response->getStatusCode(), 'body' => $body];
    }
}
