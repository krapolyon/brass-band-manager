<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/songs/{id}: one song, with its files, its parts, the averages of
// the band and the levels of the member who asks.
final class ShowSongAction
{
    public function __construct(private readonly Songs $songs)
    {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        return Json::write($response, $this->songs->one(CurrentMember::of($request), (int) $arguments['id']));
    }
}
