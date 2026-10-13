<?php

declare(strict_types=1);

namespace BrassBand\Push;

use BrassBand\Mail\AllowedRecipients;
use Doctrine\DBAL\Connection;
use Http\Discovery\Psr18ClientDiscovery;

// Builds Push from the configuration of the server (config.php, "push").
// Without keys, the instance sends no notification and the app does not offer
// them.
final class PushSetup
{
    /**
     * @param array<mixed> $config The whole configuration of the server
     */
    public static function from(array $config, Connection $database): Push
    {
        $recipients = new AllowedRecipients($config);
        $push = is_array($config['push'] ?? null) ? $config['push'] : [];
        $text = static fn (mixed $value): string => is_string($value) ? trim($value) : '';
        $publicKey = $text($push['publicKey'] ?? '');
        $privateKey = $text($push['privateKey'] ?? '');
        if ($publicKey === '' || $privateKey === '') {
            return new Push($database, null, null, $recipients);
        }

        // The local test server records the notifications instead of sending them.
        $recordTo = $text($push['recordTo'] ?? '');
        if ($recordTo !== '') {
            return new Push($database, $publicKey, new RecordedTransport($recordTo), $recipients);
        }

        // Who sends, for the push services: the address of the app.
        $subject = $text($push['subject'] ?? '') ?: $text($config['appUrl'] ?? '');
        try {
            $transport = new WebPushTransport($subject, $publicKey, $privateKey, Psr18ClientDiscovery::find());
        } catch (\Throwable $failure) {
            error_log('Push notifications are configured but cannot be sent: ' . $failure::class);

            return new Push($database, null, null, $recipients);
        }

        return new Push($database, $publicKey, $transport, $recipients);
    }
}
