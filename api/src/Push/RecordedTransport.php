<?php

declare(strict_types=1);

namespace BrassBand\Push;

// The transport of the local test server: writes each notification to a file,
// one JSON object per line, and sends nothing. Never used on the host.
final class RecordedTransport implements PushTransport
{
    public function __construct(private readonly string $file)
    {
    }

    public function send(array $messages): array
    {
        $gone = [];
        foreach ($messages as $message) {
            // An address the tests mark as expired, as a push service would answer.
            if (str_contains($message['endpoint'], '/gone/')) {
                $gone[] = $message['endpoint'];
                continue;
            }
            file_put_contents(
                $this->file,
                json_encode([
                    'endpoint' => $message['endpoint'],
                    'payload' => json_decode($message['payload'], true),
                    'options' => $message['options'],
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n",
                FILE_APPEND | LOCK_EX,
            );
        }

        return $gone;
    }
}
