<?php

declare(strict_types=1);

namespace BrassBand\Push;

use BrassBand\Mail\AllowedRecipients;
use BrassBand\Mail\Mailer;
use BrassBand\Members\PersonalData;
use Doctrine\DBAL\Connection;
use Http\Discovery\Psr18ClientDiscovery;

// Builds Push from the configuration of the server (config.php, "push" and
// "mail"). Without keys, the instance sends no push notification and the app
// does not offer them; the emails a member chose still leave.
final class PushSetup
{
    /**
     * @param array<mixed> $config The whole configuration of the server
     */
    public static function from(array $config, Connection $database, ?PersonalData $personal = null): Push
    {
        // The address of a member is encrypted in the database.
        $personal ??= PersonalData::from($config, $database);
        $recipients = new AllowedRecipients($config);
        // The emails of the notifications a member chose to receive by email.
        $mailer = new Mailer($config);
        $push = is_array($config['push'] ?? null) ? $config['push'] : [];
        $text = static fn (mixed $value): string => is_string($value) ? trim($value) : '';
        $publicKey = $text($push['publicKey'] ?? '');
        $privateKey = $text($push['privateKey'] ?? '');
        if ($publicKey === '' || $privateKey === '') {
            return new Push($database, null, null, $recipients, $personal, $mailer);
        }

        // The local test server records the notifications instead of sending them.
        $recordTo = $text($push['recordTo'] ?? '');
        if ($recordTo !== '') {
            return new Push($database, $publicKey, new RecordedTransport($recordTo), $recipients, $personal, $mailer);
        }

        // Who sends, for the push services: the address of the app.
        $subject = $text($push['subject'] ?? '') ?: $text($config['appUrl'] ?? '');
        try {
            $transport = new WebPushTransport($subject, $publicKey, $privateKey, Psr18ClientDiscovery::find());
        } catch (\Throwable $failure) {
            error_log('Push notifications are configured but cannot be sent: ' . $failure::class);

            return new Push($database, null, null, $recipients, $personal, $mailer);
        }

        return new Push($database, $publicKey, $transport, $recipients, $personal, $mailer);
    }
}
