<?php

declare(strict_types=1);

namespace BrassBand\Push;

use BrassBand\Http\AfterResponse;
use BrassBand\Http\ApiError;
use BrassBand\Mail\AllowedRecipients;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;

// Push notifications: the devices that accepted them (pushSubscription,
// model/members.md) and the sending. Used by every notification of the app:
// the reminders and the live setlist, a gig playable or confirmed, a new song,
// score or part. A device belongs to a session: signed out, it receives
// nothing. The address and the secret of a device never leave the server.
//
// What a member receives is a setting of their account (NotificationSetting):
// a sender names the setting its notification depends on, and the members
// who turned it off get nothing. The device that made the request can be
// left out: it does not ring for what it just did.
final class Push
{
    // The push services of the browsers. The server only ever writes to
    // these: a member cannot make it call an address of their choice.
    private const SERVICES = [
        'fcm.googleapis.com',
        'android.googleapis.com',
        'updates.push.services.mozilla.com',
        'web.push.apple.com',
        'notify.windows.com',
    ];

    // The longest a push service keeps a notification for a device that is
    // off: a setlist moves on in minutes, a reminder is still good the next day.
    public const TTL_LIVE = 600;
    public const TTL_REMINDER = 86400;
    // A gig or a song that changed is still news the next day.
    public const TTL_NEWS = 86400;

    public function __construct(
        private readonly Connection $database,
        private readonly ?string $publicKey,
        private readonly ?PushTransport $transport,
        private readonly AllowedRecipients $recipients,
    ) {
    }

    /** The key a browser subscribes with. Null on an instance that sends no notification. */
    public function publicKey(): ?string
    {
        return $this->transport === null ? null : $this->publicKey;
    }

    public function isSubscribed(int $sessionId): bool
    {
        return $this->database->fetchOne('SELECT 1 FROM pushSubscription WHERE memberSessionId = ?', [$sessionId]) !== false;
    }

    /** The device of a session accepts notifications: one subscription per session, the last one given. */
    public function subscribe(int $sessionId, string $endpoint, string $p256dhKey, string $authKey, int $byMemberId): void
    {
        if ($this->publicKey() === null) {
            throw new ApiError(409, 'pushNotConfigured');
        }
        $host = parse_url($endpoint, PHP_URL_HOST);
        $isKnown = is_string($host) && array_filter(
            self::SERVICES,
            fn (string $service) => $host === $service || str_ends_with($host, '.' . $service),
        ) !== [];
        $isKey = fn (string $key, int $max) => preg_match('/^[A-Za-z0-9_-]{16,' . $max . '}={0,2}$/', $key) === 1;
        if (!str_starts_with($endpoint, 'https://') || !$isKnown || strlen($endpoint) > 500
            || !$isKey($p256dhKey, 98) || !$isKey($authKey, 48)) {
            throw new ApiError(422, 'invalidInput', ['endpoint' => 'invalid']);
        }

        $this->database->transactional(function () use ($sessionId, $endpoint, $p256dhKey, $authKey, $byMemberId): void {
            // The same browser under another session, or this session before: replaced.
            $this->database->executeStatement(
                'DELETE FROM pushSubscription WHERE memberSessionId = ? OR endpoint = ?',
                [$sessionId, $endpoint],
            );
            $this->database->insert('pushSubscription', [
                'memberSessionId' => $sessionId,
                'endpoint' => $endpoint,
                'p256dhKey' => $p256dhKey,
                'authKey' => $authKey,
                'updatedByMemberId' => $byMemberId,
            ]);
        });
    }

    public function unsubscribe(int $sessionId): void
    {
        $this->database->delete('pushSubscription', ['memberSessionId' => $sessionId]);
    }

    /**
     * Sends a notification to every device of some members, once the answer
     * of the request has left: whoever asked does not wait for the phones.
     *
     * @param list<int> $memberIds
     * @param callable(int $memberId, string $language): ?array<string, mixed> $notification What the device shows (title, body, tag, url…), written for one member in their language; null sends them nothing
     * @param int $ttl Seconds a push service keeps it for a device that is off
     * @param string|null $topic Replaces, at the push service, a notification of the same topic not delivered yet
     * @param NotificationSetting|null $setting The setting of the account this notification depends on; null for one that is always sent (the reminders)
     * @param int|null $exceptSessionId The session of the device that made the request: it receives nothing
     */
    public function toMembers(
        array $memberIds,
        callable $notification,
        int $ttl,
        ?string $topic = null,
        ?NotificationSetting $setting = null,
        ?int $exceptSessionId = null,
    ): void {
        if ($this->transport === null || $memberIds === []) {
            return;
        }
        // The column comes from the enum, never from what was sent.
        $wanted = $setting === null ? '' : ' AND m.' . $setting->column() . " = '" . NotificationChannel::PUSH->value . "'";
        $devices = $this->database->fetchAllAssociative(
            'SELECT p.endpoint, p.p256dhKey, p.authKey, m.id AS memberId, m.language, m.email
             FROM pushSubscription p
             JOIN memberSession s ON s.id = p.memberSessionId AND s.expiresAt > UTC_TIMESTAMP()
             JOIN member m ON m.id = s.memberId
             WHERE m.id IN (?) AND m.status IN (\'ACTIVE\', \'POWER_MEMBER\') AND s.id <> ?' . $wanted,
            [$memberIds, $exceptSessionId ?? 0],
            [ArrayParameterType::INTEGER, ParameterType::INTEGER],
        );

        $messages = [];
        $written = [];
        $putAside = 0;
        foreach ($devices as $device) {
            // An instance that only writes to some members notifies nobody else.
            if (!$this->recipients->allows((string) $device['email'])) {
                $putAside++;
                continue;
            }
            $memberId = (int) $device['memberId'];
            $written[$memberId] ??= [$notification($memberId, (string) $device['language'])];
            $payload = $written[$memberId][0];
            if ($payload === null) {
                continue;
            }
            $messages[] = [
                'endpoint' => (string) $device['endpoint'],
                'p256dhKey' => (string) $device['p256dhKey'],
                'authKey' => (string) $device['authKey'],
                'payload' => json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'options' => ['TTL' => $ttl, 'urgency' => 'high', ...($topic === null ? [] : ['topic' => $topic])],
            ];
        }
        AllowedRecipients::logPutAside('notification', $putAside);
        if ($messages === []) {
            return;
        }

        $transport = $this->transport;
        $database = $this->database;
        AfterResponse::add(static function () use ($transport, $database, $messages): void {
            $gone = $transport->send($messages);
            if ($gone !== []) {
                // A device that removed the app or withdrew its permission.
                $database->executeStatement(
                    'DELETE FROM pushSubscription WHERE endpoint IN (?)',
                    [$gone],
                    [ArrayParameterType::STRING],
                );
            }
        });
    }
}
