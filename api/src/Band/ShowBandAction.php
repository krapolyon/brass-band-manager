<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/band: the name of the band, the addresses of its logo and icons,
// and its three defaults (accent theme, language, country), for the screens
// shown before sign-in and the icon of the page.
//
// Public: the band table holds nothing private (model/band.md). Nothing about
// a member may ever be added to this answer.
final class ShowBandAction
{
    public function __construct(private readonly Bands $bands)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->bands->view());
    }
}
