<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/band/logo: removes the logo of the band and its icons; the app
// keeps the icons of its own icon, or goes back to its neutral icon.
// DELETE /api/band/appIcon: removes the icon of the app; the icons are those
// of the logo again. Both ask for MANAGE_BAND.
final class DeleteLogoAction
{
    public function __construct(
        private readonly LogoStore $logos,
        private readonly bool $appIcon = false,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->logos->replace(null, CurrentMember::of($request)->id, $this->appIcon);

        return Json::write($response, $this->logos->urls());
    }
}
