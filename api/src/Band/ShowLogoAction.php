<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\ApiError;
use BrassBand\Storage\ServeFile;
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

        // An address that names the current logo never changes what it gives:
        // the browser may keep it. Any other address is checked every time.
        $isCurrent = ($request->getQueryParams()['v'] ?? null) === $found['version'];

        return ServeFile::write(
            $response,
            $found['file'],
            $isCurrent ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
    }
}
