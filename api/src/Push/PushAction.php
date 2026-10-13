<?php

declare(strict_types=1);

namespace BrassBand\Push;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// The notifications of the device that asks, which is its session
// (model/members.md, `pushSubscription`). For any signed-in member, about
// their own device only: the address names nobody.
//
// GET /api/push says whether this device is subscribed, and gives the public
// key a browser subscribes with (null when the instance sends no
// notification). PUT /api/push/subscription keeps what the browser gave;
// DELETE forgets it. All three answer the same thing; what the browser gave
// is never sent back.
final class PushAction
{
    public function __construct(private readonly Push $push)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $me = CurrentMember::of($request);

        if ($request->getMethod() === 'PUT') {
            $input = Input::from($request, SubscriptionInput::class);
            $this->push->subscribe($me->sessionId, $input->endpoint, $input->p256dhKey, $input->authKey, $me->id);
        } elseif ($request->getMethod() === 'DELETE') {
            $this->push->unsubscribe($me->sessionId);
        }

        return Json::write($response, [
            'publicKey' => $this->push->publicKey(),
            'isSubscribed' => $this->push->isSubscribed($me->sessionId),
        ]);
    }
}
