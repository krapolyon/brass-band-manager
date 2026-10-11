<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/band: the name of the band and the addresses of its logo and
// icons, for the sign-in screen and the icon of the page.
//
// Public: the name and the logo are the only things of the app that are shown
// without signing in (model/band.md). Nothing else may be added to this answer
// without that rule changing first.
final class ShowBandAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly LogoStore $logos,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $band = $this->database->fetchAssociative('SELECT name FROM band WHERE id = 1');
        if ($band === false) {
            throw new ApiError(404, 'notInstalled');
        }

        return Json::write($response, [
            'name' => $band['name'],
            ...($this->logos->urls() ?? ['logoUrl' => null, 'icons' => null]),
        ]);
    }
}
