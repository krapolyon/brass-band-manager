<?php

declare(strict_types=1);

namespace BrassBand\Push;

// What carries notifications to the push services of the browsers. The real
// one is WebPushTransport; the test server records them instead of sending
// them (RecordedTransport).
interface PushTransport
{
    /**
     * Sends each message to its device.
     *
     * @param list<array{endpoint: string, p256dhKey: string, authKey: string, payload: string, options: array<string, mixed>}> $messages
     * @return list<string> The endpoints the push service says are gone: their subscriptions are deleted
     */
    public function send(array $messages): array;
}
