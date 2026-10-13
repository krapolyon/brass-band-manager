<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/gigs/{id}/setlists and PUT /api/setlists/{id}: writes a setlist
// of a gig, or saves one. Asks for MANAGE_SETLISTS. Rules: model/gigs.md,
// entry 4. Answers the gig.
//
// The number is given here, never typed: one more than the highest of the
// gig. A song is added only while the band plays it (in the repertoire or
// temporary); one that is already in the setlist stays, whatever it became.
final class SaveSetlistAction
{
    public const MAX_SONGS = 100;

    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
        private readonly Setlists $setlists,
    ) {
    }

    /**
     * @param array{id: string} $arguments The gig for POST, the setlist for PUT
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $isNew = $request->getMethod() === 'POST';
        $input = Input::from($request, SetlistInput::class);

        $gigId = $this->database->transactional(function () use ($isNew, $arguments, $input, $me): int {
            // The gig first, then the setlist: the order DeleteGigAction locks them in.
            $gigId = $isNew ? (int) $arguments['id'] : (int) $this->setlists->row((int) $arguments['id'])['gigId'];
            // A draft does not exist for who cannot edit it.
            $gig = $this->gigs->rowVisibleTo($me, $gigId, lock: true);
            $setlist = $isNew ? null : $this->setlists->row((int) $arguments['id'], lock: true);
            if ($gig['status'] !== GigStatus::CONFIRMED->value) {
                throw new ApiError(409, 'gigNotConfirmed');
            }

            $errors = new FieldErrors();
            $description = $errors->optionalText('description', $input->description, Setlists::DESCRIPTION_MAX_LENGTH);

            // The slot: asked when the gig has several, the only one otherwise.
            $slotIds = array_map(intval(...), $this->database->fetchFirstColumn('SELECT id FROM gigSlot WHERE gigId = ?', [$gigId]));
            $slotId = $input->gigSlotId ?? (count($slotIds) === 1 ? $slotIds[0] : null);
            if ($slotId === null) {
                $errors->add('gigSlotId', 'required');
            } elseif (!in_array($slotId, $slotIds, true)) {
                $errors->add('gigSlotId', 'invalid');
            }

            // The songs: those the band plays, and those the setlist already holds.
            $songIds = $input->songIds;
            if (count($songIds) > self::MAX_SONGS) {
                $errors->add('songIds', 'tooMany');
            } elseif ($songIds !== []) {
                $allowed = array_map(intval(...), $this->database->fetchFirstColumn(
                    "SELECT id FROM song WHERE id IN (?) AND (status IN ('IN_REPERTOIRE', 'TEMPORARY')
                        OR id IN (SELECT songId FROM setlistSong WHERE setlistId = ?))",
                    [array_values(array_unique($songIds)), $setlist['id'] ?? 0],
                    [ArrayParameterType::INTEGER],
                ));
                if (array_diff($songIds, $allowed) !== []) {
                    $errors->add('songIds', 'invalid');
                }
            }
            $errors->throwIfAny();

            $values = ['gigSlotId' => $slotId, 'description' => $description, 'updatedByMemberId' => $me->id];
            if ($setlist === null) {
                $number = (int) $this->database->fetchOne('SELECT COALESCE(MAX(number), 0) + 1 FROM setlist WHERE gigId = ?', [$gigId]);
                $this->database->insert('setlist', [...$values, 'gigId' => $gigId, 'number' => $number]);
                $setlistId = (int) $this->database->lastInsertId();
            } else {
                $setlistId = (int) $setlist['id'];
                // A live setlist keeps its position, the same number: never beyond its last song.
                if ($setlist['livePosition'] !== null) {
                    $values['livePosition'] = $songIds === [] ? null : min((int) $setlist['livePosition'], count($songIds));
                    if ($songIds === []) {
                        $values['liveStartedAt'] = null;
                    }
                }
                $this->database->update('setlist', $values, ['id' => $setlistId]);
                $this->database->delete('setlistSong', ['setlistId' => $setlistId]);
            }
            foreach ($songIds as $index => $songId) {
                $this->database->insert('setlistSong', [
                    'setlistId' => $setlistId,
                    'position' => $index + 1,
                    'songId' => $songId,
                    'updatedByMemberId' => $me->id,
                ]);
            }

            return $gigId;
        });

        return Json::write($response, $this->gigs->one($me, $gigId), $isNew ? 201 : 200);
    }
}
