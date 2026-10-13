<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

// Lets a request through only when it comes from a signed-in member, and tells
// the action who that member is (CurrentMember::of($request)).
// Attached in routes.php to every route that is not public.
final class RequireSession implements MiddlewareInterface
{
    public function __construct(
        private readonly Sessions $sessions,
        private readonly SessionCookie $cookie,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $token = $this->cookie->read($request);
        $member = $token === null ? null : $this->sessions->find($token);
        if ($member === null) {
            throw new ApiError(401, 'notSignedIn');
        }

        return $handler->handle($request->withAttribute(CurrentMember::class, $member));
    }
}
