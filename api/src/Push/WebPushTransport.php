<?php

declare(strict_types=1);

namespace BrassBand\Push;

use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Psr\Http\Client\ClientInterface;
use Psr\Log\NullLogger;
use Slim\Psr7\Factory\RequestFactory;
use Slim\Psr7\Factory\StreamFactory;

// Sends notifications with the Web Push library: it encrypts each one for its
// device and signs the request with the keys of the instance (VAPID).
final class WebPushTransport implements PushTransport
{
    /**
     * @param string $subject Who sends: the address of the app, or "mailto:" and an address
     */
    public function __construct(
        private readonly string $subject,
        private readonly string $publicKey,
        private readonly string $privateKey,
        private readonly ClientInterface $client,
    ) {
    }

    public function send(array $messages): array
    {
        $webPush = new WebPush(
            ['VAPID' => ['subject' => $this->subject, 'publicKey' => $this->publicKey, 'privateKey' => $this->privateKey]],
            [],
            $this->client,
            new RequestFactory(),
            new StreamFactory(),
            // Without it, the library writes a notice to the log at each sending
            // on a host that lacks the GMP or BCMath extension: it is only slower.
            logger: new NullLogger(),
        );
        // One signature per push service, not one per device.
        $webPush->setReuseVAPIDHeaders(true);

        foreach ($messages as $message) {
            $webPush->queueNotification(
                Subscription::create([
                    'endpoint' => $message['endpoint'],
                    'keys' => ['p256dh' => $message['p256dhKey'], 'auth' => $message['authKey']],
                ]),
                $message['payload'],
                $message['options'],
            );
        }

        $gone = [];
        foreach ($webPush->flush() as $report) {
            if ($report->isSubscriptionExpired()) {
                $gone[] = $report->getEndpoint();
            }
        }

        return $gone;
    }
}
