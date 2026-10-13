<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/setlists/{id}: one setlist with its songs and where its live
// session is. For every signed-in member, from the moment its gig is
// confirmed. The live screen asks for it again and again: it reads the
// setlist alone, not its gig.
final class ShowSetlistAction
{
    public function __construct(
        private readonly Gigs $gigs,
        private readonly Setlists $setlists,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $setlist = $this->setlists->one((int) $arguments['id']);
        $gig = $this->gigs->rowVisibleTo(CurrentMember::of($request), $setlist['gigId']);
        if ($gig['status'] !== GigStatus::CONFIRMED->value) {
            throw new ApiError(404, 'notFound');
        }

        return Json::write($response, [...$setlist, 'gigName' => $gig['name']]);
    }
}
