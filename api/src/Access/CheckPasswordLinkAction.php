<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/passwordLink/check: tells whether a password link can still be
// used, and for whom, so that the screen can greet the member before asking
// for a password. Changes nothing.
//
// Public: whoever holds the link is not signed in yet. The token travels in
// the body, never in an address, where it would end in the log of the server.
// Every link that opens nothing gets the same answer.
final class CheckPasswordLinkAction
{
    public function __construct(private readonly PasswordLinks $links)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $link = $this->links->find(Input::from($request, PasswordLinkInput::class)->token);
        if ($link === null) {
            throw new ApiError(404, 'invalidPasswordLink');
        }

        // The nickname and nothing else: it is what the holder of the link is called here.
        return Json::write($response, ['nickname' => $link['nickname']]);
    }
}
