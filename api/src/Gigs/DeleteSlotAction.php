<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/gigs/{id}/slots/{slotId}: deletes a slot and the answers given
// for it. For who may edit the gig (RequireGigEditor). A gig always keeps one
// slot: the last one cannot be deleted. The screen asks first.
final class DeleteSlotAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
    ) {
    }

    /**
     * @param array{id: string, slotId: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $gigId = (int) $arguments['id'];

        $this->database->transactional(function () use ($gigId, $arguments, $me): void {
            $this->gigs->row($gigId, lock: true);
            $slotIds = array_map(intval(...), $this->database->fetchFirstColumn('SELECT id FROM gigSlot WHERE gigId = ?', [$gigId]));
            if (!in_array((int) $arguments['slotId'], $slotIds, true)) {
                throw new ApiError(404, 'notFound');
            }
            if (count($slotIds) === 1) {
                throw new ApiError(409, 'lastSlot');
            }
            // The answers go with the row: the database deletes them.
            $this->database->delete('gigSlot', ['id' => (int) $arguments['slotId']]);
            $this->gigs->placeSlot($gigId, null, 0, $me->id);
        });

        return Json::write($response, $this->gigs->one($me, $gigId));
    }
}
