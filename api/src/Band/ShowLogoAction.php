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
//
// An icon is asked even when the band has none: index.html names
// /api/band/icon/192 as the icon of the browser tab, read before the app has
// loaded (issue #48). Without an icon or a logo, the address leads to the
// neutral icon of the app.
final class ShowLogoAction
{
    // The neutral icons of the app, files of web/public/appIcons.
    private const NEUTRAL = [
        180 => '/appIcons/apple-touch-icon.png',
        192 => '/appIcons/icon-192.png',
        512 => '/appIcons/icon-512.png',
    ];

    public function __construct(private readonly LogoStore $logos)
    {
    }

    /**
     * @param array{size?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $size = isset($arguments['size']) ? (int) $arguments['size'] : null;
        $found = $this->logos->file($size);
        if ($found === null && $size !== null) {
            // Checked again every time: the band may give a logo later.
            return $response
                ->withStatus(302)
                ->withHeader('Location', self::NEUTRAL[$size] ?? self::NEUTRAL[192])
                ->withHeader('Cache-Control', 'no-cache');
        }
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
