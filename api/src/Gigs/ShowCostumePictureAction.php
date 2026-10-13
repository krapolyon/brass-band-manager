<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Http\ApiError;
use BrassBand\Storage\ServeFile;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/costumes/{id}/picture: the picture of a costume, for signed-in
// members. Like every file of the band, it leaves the storage folder through
// an action only.
final class ShowCostumePictureAction
{
    public function __construct(private readonly CostumePictures $pictures)
    {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $found = $this->pictures->file((int) $arguments['id']);
        if ($found === null) {
            throw new ApiError(404, 'notFound');
        }
        // Kept by the browser of the member only, and asked again each time:
        // when it is still the right version, the answer carries no image.
        $version = '"' . $found['version'] . '"';
        if ($request->getHeaderLine('If-None-Match') === $version) {
            return $response->withStatus(304)->withHeader('ETag', $version)->withHeader('Cache-Control', 'private, no-cache');
        }

        return ServeFile::write($response, $found['file'], 'private, no-cache')->withHeader('ETag', $version);
    }
}
