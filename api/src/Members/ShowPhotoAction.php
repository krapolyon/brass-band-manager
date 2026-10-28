<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Storage\ServeFile;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/members/{id}/photo: the profile photo of a member. For signed-in
// members only, and only for the members they may see: unlike the logo of the
// band, a photo is never public (model/members.md, "Profile photo").
final class ShowPhotoAction
{
    public function __construct(
        private readonly Members $members,
        private readonly PhotoStore $photos,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        // 404 for a member the viewer may not see.
        $found = $this->photos->file($this->members->photoPathVisibleTo(CurrentMember::of($request), (int) $arguments['id']));
        if ($found === null) {
            throw new ApiError(404, 'notFound');
        }

        // Kept by the browser of the member only, and asked again each time: a
        // photo is not shown from a cache to someone who has signed out, or
        // after its member has left.
        return ServeFile::privately($request, $response, $found['file'], $found['version']);
    }
}
