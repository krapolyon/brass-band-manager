<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\ApiError;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/band/logo and GET /api/band/icon/{size}: the logo of the band, and
// the icons of the installed app made from it.
//
// Public: a phone reads the icon without being signed in, and the sign-in
// screen shows the logo (model/band.md).
final class ShowLogoAction
{
    public function __construct(private readonly LogoStore $logos)
    {
    }

    /**
     * @param array{size?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $found = $this->logos->file(isset($arguments['size']) ? (int) $arguments['size'] : null);
        if ($found === null) {
            throw new ApiError(404, 'notFound');
        }

        // The file may have been replaced since it was found.
        $content = @file_get_contents($found['file']);
        if ($content === false) {
            throw new ApiError(404, 'notFound');
        }
        $response->getBody()->write($content);

        // An address that names the current logo never changes what it gives:
        // the browser may keep it. Any other address is checked every time.
        $isCurrent = ($request->getQueryParams()['v'] ?? null) === $found['version'];

        return $response
            ->withHeader('Content-Type', $found['contentType'])
            ->withHeader('Cache-Control', $isCurrent ? 'public, max-age=31536000, immutable' : 'no-cache')
            // The file is what its type says, never a page.
            ->withHeader('X-Content-Type-Options', 'nosniff')
            // Shown by this app only, never embedded by another site.
            ->withHeader('Cross-Origin-Resource-Policy', 'same-origin')
            // An SVG can carry scripts. Shown as an image it runs none; opened
            // by its address, this forbids it to run or to load anything.
            ->withHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
}
