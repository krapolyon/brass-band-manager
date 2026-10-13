<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/band/logo: removes the logo of the band and its icons; the app
// goes back to its neutral icon. Asks for MANAGE_BAND.
final class DeleteLogoAction
{
    public function __construct(private readonly LogoStore $logos)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->logos->replace(null, CurrentMember::of($request)->id);

        return Json::write($response, ['logoUrl' => null, 'icons' => null]);
    }
}
