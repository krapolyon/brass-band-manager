<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/session: signs the current device out.
// DELETE /api/sessions: signs every device of the member out.
final class SignOutAction
{
    public function __construct(
        private readonly Sessions $sessions,
        private readonly SessionCookie $cookie,
        private readonly bool $everywhere,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $member = CurrentMember::of($request);

        if ($this->everywhere) {
            $this->sessions->closeAll($member->id);
        } else {
            $this->sessions->close($member->sessionId);
        }

        return $this->cookie->clear(Json::write($response, ['signedOut' => true]));
    }
}
