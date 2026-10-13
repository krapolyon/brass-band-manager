<?php

declare(strict_types=1);

namespace BrassBand\Push;

final class SubscriptionInput
{
    /**
     * The three values a browser gives when it accepts notifications.
     *
     * @param string $endpoint The address of the device at its push service
     * @param string $p256dhKey The key that encrypts a notification for the device
     * @param string $authKey The secret given with the key
     */
    public function __construct(
        public readonly string $endpoint,
        public readonly string $p256dhKey,
        public readonly string $authKey,
    ) {
    }
}
