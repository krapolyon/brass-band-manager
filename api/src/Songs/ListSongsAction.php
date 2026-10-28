<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/songs: every song, by name, whatever its status. The list filters
// by status on the device.
final class ListSongsAction
{
    public function __construct(private readonly Songs $songs)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->songs->all(CurrentMember::of($request)));
    }
}
