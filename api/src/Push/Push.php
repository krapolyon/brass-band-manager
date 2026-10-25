<?php

declare(strict_types=1);

namespace BrassBand\Push;

use BrassBand\Access\AccessRules;
use BrassBand\Http\AfterResponse;
use BrassBand\Http\ApiError;
use BrassBand\Mail\AllowedRecipients;
use BrassBand\Mail\EmailBand;
use BrassBand\Mail\Mailer;
use BrassBand\Members\PersonalData;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;

// Notifications: the devices that accepted them (pushSubscription,
// model/members.md) and the sending, by push, by email or both. Used by every
// notification of the app: the reminders and the live setlist, a gig playable
// or confirmed, a new song, score or part. A device belongs to a session:
// signed out, it receives nothing. The address and the secret of a device
// never leave the server.
//
// What a member receives, and how, is a setting of their account
// (NotificationSetting, issue #27): a sender names the setting its
// notification depends on, and each member gets it through the channels they
// chose. The device that made the request can be left out of the push: it
// does not ring for what it just did. An email is sent whatever the device.
//
// The email tells the same news in HTML (NotificationEmails, issue #65), with
// a button that opens the gig or the song. Without a
// mail server, a choice saved with email is read as push. The reminders to
// answer always reach the member: chosen by push only, they go by email when
// no device of the member accepts notifications.
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
        private readonly PersonalData $personal,
        private readonly ?Mailer $mailer = null,
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
     * Sends a notification to some members, by the channels each one chose,
     * once the answer of the request has left: whoever asked does not wait
     * for the phones nor for the mail server.
     *
     * @param list<int> $memberIds
     * @param callable(int $memberId, string $language): ?array<string, mixed> $notification What the device shows (title, body, tag, url…), written for one member in their language; null sends them nothing
     * @param int $ttl Seconds a push service keeps it for a device that is off
     * @param string|null $topic Replaces, at the push service, a notification of the same topic not delivered yet
     * @param NotificationSetting|null $setting The setting of the account this notification depends on; null for a push always sent
     * @param int|null $exceptSessionId The session of the device that made the request: it receives no push
     */
    public function toMembers(
        array $memberIds,
        callable $notification,
        int $ttl,
        ?string $topic = null,
        ?NotificationSetting $setting = null,
        ?int $exceptSessionId = null,
    ): void {
        $canEmail = $this->mailer !== null && $this->mailer->canSend();
        if ($memberIds === [] || ($this->transport === null && !$canEmail)) {
            return;
        }

        // The column comes from the enum, never from what was sent.
        $channel = $setting === null ? "'PUSH'" : 'm.' . $setting->column();
        $members = $this->database->fetchAllAssociative(
            "SELECT m.id, m.language, m.email, {$channel} AS channel,
                EXISTS (
                    SELECT 1 FROM pushSubscription p JOIN memberSession s ON s.id = p.memberSessionId
                    WHERE s.memberId = m.id AND s.expiresAt > UTC_TIMESTAMP()
                ) AS hasDevice
             FROM member m
             WHERE m.id IN (?) AND m.status IN (" . AccessRules::SIGN_IN_STATUSES_SQL . ')',
            [$memberIds],
            [ArrayParameterType::INTEGER],
        );

        $byPush = [];
        $byEmail = [];
        foreach ($members as $member) {
            $chosen = NotificationChannel::tryFrom((string) $member['channel']) ?? NotificationChannel::PUSH;
            // Without a mail server, email is read as push.
            if (!$canEmail && $chosen->hasEmail()) {
                $chosen = NotificationChannel::PUSH;
            }
            $hasDevice = $this->transport !== null && (bool) $member['hasDevice'];
            if ($chosen->hasPush()) {
                $byPush[] = (int) $member['id'];
            }
            $isReminderWithoutDevice = $setting === NotificationSetting::GIG_REMINDER && $chosen === NotificationChannel::PUSH && !$hasDevice;
            if ($canEmail && ($chosen->hasEmail() || $isReminderWithoutDevice)) {
                // The email says why it came: chosen, or for want of a device.
                $byEmail[] = [...$member, 'email' => $this->emailOf($member), 'isChosen' => $chosen->hasEmail()];
            }
        }

        // Written once per member, for both channels.
        $written = [];
        $write = static function (int $memberId, string $language) use (&$written, $notification): ?array {
            if (!array_key_exists($memberId, $written)) {
                $written[$memberId] = $notification($memberId, $language);
            }

            return $written[$memberId];
        };

        if ($this->transport !== null && $byPush !== []) {
            $this->pushTo($byPush, $write, $ttl, $topic, $exceptSessionId);
        }
        if ($byEmail !== [] && $this->mailer !== null) {
            $this->emailTo($byEmail, $write);
        }
    }

    /**
     * @param list<int> $memberIds
     * @param callable(int, string): ?array<string, mixed> $write
     */
    private function pushTo(array $memberIds, callable $write, int $ttl, ?string $topic, ?int $exceptSessionId): void
    {
        $devices = $this->database->fetchAllAssociative(
            'SELECT p.endpoint, p.p256dhKey, p.authKey, m.id AS memberId, m.language, m.email
             FROM pushSubscription p
             JOIN memberSession s ON s.id = p.memberSessionId AND s.expiresAt > UTC_TIMESTAMP()
             JOIN member m ON m.id = s.memberId
             WHERE m.id IN (?) AND s.id <> ?',
            [$memberIds, $exceptSessionId ?? 0],
            [ArrayParameterType::INTEGER, ParameterType::INTEGER],
        );

        $messages = [];
        $putAside = 0;
        foreach ($devices as $device) {
            // An instance that only writes to some members notifies nobody else.
            if (!$this->recipients->allows($this->emailOf($device))) {
                $putAside++;
                continue;
            }
            $payload = $write((int) $device['memberId'], (string) $device['language']);
            if ($payload === null) {
                continue;
            }
            $messages[] = [
                'endpoint' => (string) $device['endpoint'],
                'p256dhKey' => (string) $device['p256dhKey'],
                'authKey' => (string) $device['authKey'],
                // The part that describes the email stays on the server.
                'payload' => json_encode(array_diff_key($payload, ['email' => true]), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'options' => ['TTL' => $ttl, 'urgency' => 'high', ...($topic === null ? [] : ['topic' => $topic])],
            ];
        }
        AllowedRecipients::logPutAside('notification', $putAside);
        if ($messages === [] || $this->transport === null) {
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

    /**
     * One email per member, drawn by NotificationEmails from the notification
     * (issue #65): the same news as the push, with the gig or the song as the
     * app shows them and a button that opens them. They leave together,
     * after the answer.
     *
     * @param list<array<string, mixed>> $members
     * @param callable(int, string): ?array<string, mixed> $write
     */
    private function emailTo(array $members, callable $write): void
    {
        $mailer = $this->mailer;
        if ($mailer === null) {
            return;
        }
        $band = EmailBand::of($this->database, $mailer);
        $emails = new NotificationEmails($this->database, $mailer);
        $messages = [];
        foreach ($members as $member) {
            $language = (string) $member['language'];
            $payload = $write((int) $member['id'], $language);
            if ($payload === null) {
                continue;
            }
            $messages[] = [
                'to' => (string) $member['email'],
                'message' => $emails->render($band, (int) $member['id'], $language, $payload, (bool) $member['isChosen']),
            ];
        }
        $mailer->sendLater($band->name, $messages, 'notification');
    }

    /**
     * The email of a row of member, in clear: encrypted in the database.
     *
     * @param array<string, mixed> $row
     */
    private function emailOf(array $row): string
    {
        return (string) $this->personal->opened(['email' => $row['email']])['email'];
    }
}
