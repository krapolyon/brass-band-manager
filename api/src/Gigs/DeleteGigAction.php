<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/gigs/{id}: deletes a draft, with its slots, its organisers and
// its list of costumes. Asks for MANAGE_GIGS. A gig members have seen is
// cancelled, never deleted (model/gigs.md, "Access rights"): so is a gig
// that was reopened as a draft with the answers members gave it.
final class DeleteGigAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $this->database->transactional(function () use ($arguments): void {
            $gig = $this->gigs->row((int) $arguments['id'], lock: true);
            if ($gig['status'] !== GigStatus::DRAFT->value) {
                throw new ApiError(409, 'gigNotDraft');
            }
            $answers = $this->database->fetchOne(
                'SELECT 1 FROM gigSlotAttendance a JOIN gigSlot s ON s.id = a.gigSlotId WHERE s.gigId = ? LIMIT 1',
                [$gig['id']],
            );
            if ($answers !== false) {
                throw new ApiError(409, 'gigHasAnswers');
            }
            // In this order: a setlist and the costume of a slot both hold
            // the gig back in the database. The rest goes with the row.
            $this->database->delete('setlist', ['gigId' => $gig['id']]);
            $this->database->delete('gigSlot', ['gigId' => $gig['id']]);
            $this->database->delete('gig', ['id' => $gig['id']]);
        });

        return Json::write($response, ['deleted' => true]);
    }
}
