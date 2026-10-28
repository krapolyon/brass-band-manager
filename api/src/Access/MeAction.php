<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/me: the signed-in member, their preferences and their permissions.
// The front asks this at startup to know whether someone is signed in.
final class MeAction
{
    public function __construct(private readonly Profile $profile)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->profile->of(CurrentMember::of($request)));
    }
}
