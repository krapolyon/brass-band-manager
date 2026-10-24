<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/gigs and PUT /api/gigs/{id}: creates a gig, or saves its whole
// record with its organisers and its costumes. Creating asks for MANAGE_GIGS;
// saving is for who may edit the gig (RequireGigEditor). Rules:
// model/gigs.md, entry 1.
//
// A gig is created in DRAFT with one slot, without a name. Its status and its
// slots have their own addresses.
final class SaveGigAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
    ) {
        $this->record = new GigRecord($database, $gigs);
    }

    private readonly GigRecord $record;

    /**
     * @param array{id?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $gigId = isset($arguments['id']) ? (int) $arguments['id'] : null;
        $isNew = $gigId === null;
        if ($gigId !== null) {
            $this->gigs->row($gigId);
        }
        $input = Input::from($request, GigInput::class);
        $record = $this->record->check($input, $gigId);
        $organizerIds = array_values(array_unique($input->organizerIds));
        $costumeIds = array_values(array_unique($input->costumeIds));

        try {
            $gigId = $this->database->transactional(function () use ($gigId, $record, $organizerIds, $costumeIds, $me): int {
                $record['updatedByMemberId'] = $me->id;
                if ($gigId === null) {
                    $this->database->insert('gig', $record);
                    $gigId = (int) $this->database->lastInsertId();
                    $this->database->insert('gigSlot', ['gigId' => $gigId, 'position' => 1, 'updatedByMemberId' => $me->id]);
                } else {
                    $this->gigs->row($gigId, lock: true);
                    $this->database->update('gig', $record, ['id' => $gigId]);
                }
                $this->setOrganizers($gigId, $organizerIds, $me);
                $this->setCostumes($gigId, $costumeIds, $me);

                return $gigId;
            });
        } catch (UniqueConstraintViolationException) {
            // Two gigs saved with the same channel at the same instant: the
            // database is the judge.
            throw new ApiError(422, 'invalidInput', ['discordChannelId' => 'duplicate']);
        }

        // An organiser who took themself off a draft no longer sees it: the
        // save is answered all the same, with what is left for them to know.
        if (!$isNew && !$this->gigs->mayEdit($me, $gigId) && $this->gigs->row($gigId)['status'] === GigStatus::DRAFT->value) {
            return Json::write($response, ['id' => $gigId, 'canEdit' => false]);
        }

        return Json::write($response, $this->gigs->one($me, $gigId), $isNew ? 201 : 200);
    }




    /**
     * @param list<int> $memberIds
     */
    private function setOrganizers(int $gigId, array $memberIds, CurrentMember $me): void
    {
        $current = array_map(intval(...), $this->database->fetchFirstColumn('SELECT memberId FROM gigOrganizer WHERE gigId = ?', [$gigId]));
        foreach (array_diff($current, $memberIds) as $memberId) {
            $this->database->delete('gigOrganizer', ['gigId' => $gigId, 'memberId' => $memberId]);
        }
        foreach (array_diff($memberIds, $current) as $memberId) {
            $this->database->insert('gigOrganizer', ['gigId' => $gigId, 'memberId' => $memberId, 'updatedByMemberId' => $me->id]);
        }
    }

    /**
     * @param list<int> $costumeIds
     */
    private function setCostumes(int $gigId, array $costumeIds, CurrentMember $me): void
    {
        $current = array_map(intval(...), $this->database->fetchFirstColumn('SELECT costumeId FROM gigCostume WHERE gigId = ?', [$gigId]));
        foreach (array_diff($current, $costumeIds) as $costumeId) {
            // A slot chooses its costume among those of the gig: taking one
            // off the gig empties it on the slots that had it.
            $this->database->update('gigSlot', ['costumeId' => null, 'updatedByMemberId' => $me->id], ['gigId' => $gigId, 'costumeId' => $costumeId]);
            $this->database->delete('gigCostume', ['gigId' => $gigId, 'costumeId' => $costumeId]);
        }
        foreach (array_diff($costumeIds, $current) as $costumeId) {
            $this->database->insert('gigCostume', ['gigId' => $gigId, 'costumeId' => $costumeId, 'updatedByMemberId' => $me->id]);
        }
    }
}
