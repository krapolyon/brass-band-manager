<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/setlists/{id}: deletes a setlist with its songs. Asks for
// MANAGE_SETLISTS. The other setlists of the gig keep their numbers. Answers
// the gig.
final class DeleteSetlistAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
        private readonly Setlists $setlists,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $gigId = $this->database->transactional(function () use ($arguments): int {
            $setlist = $this->setlists->rowShown((int) $arguments['id'], lock: true);
            // Its songs go with the row: the database deletes them.
            $this->database->delete('setlist', ['id' => $setlist['id']]);

            return (int) $setlist['gigId'];
        });

        return Json::write($response, $this->gigs->one(CurrentMember::of($request), $gigId));
    }
}
