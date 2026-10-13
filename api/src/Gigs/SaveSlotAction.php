<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/gigs/{id}/slots and PUT /api/gigs/{id}/slots/{slotId}: adds a
// slot to a gig, or saves one. For who may edit the gig (RequireGigEditor).
// Rules: model/gigs.md, entry 2.
//
// A slot needs a name as soon as its gig has several: the only slot of a gig
// is named before a second one is added (409 slotWithoutName otherwise).
final class SaveSlotAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
    ) {
    }

    /**
     * @param array{id: string, slotId?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $gigId = (int) $arguments['id'];
        $slotId = isset($arguments['slotId']) ? (int) $arguments['slotId'] : null;
        $input = Input::from($request, SlotInput::class);

        try {
            $this->database->transactional(function () use ($gigId, $slotId, $input, $me): void {
                $this->gigs->row($gigId, lock: true);
                $others = $this->database->fetchAllAssociative('SELECT id, name FROM gigSlot WHERE gigId = ? AND id <> ?', [$gigId, $slotId ?? 0]);
                if ($slotId !== null && $this->database->fetchOne('SELECT 1 FROM gigSlot WHERE id = ? AND gigId = ?', [$slotId, $gigId]) === false) {
                    throw new ApiError(404, 'notFound');
                }
                if (array_filter($others, fn (array $other) => $other['name'] === null) !== []) {
                    throw new ApiError(409, 'slotWithoutName');
                }

                $errors = new FieldErrors();
                $name = $errors->optionalText('name', $input->name, 40);
                if ($name === null && $others !== []) {
                    $errors->add('name', 'required');
                }
                // Compared as the database compares: without case or accents.
                if ($name !== null && $this->database->fetchOne('SELECT 1 FROM gigSlot WHERE gigId = ? AND name = ? AND id <> ?', [$gigId, $name, $slotId ?? 0]) !== false) {
                    $errors->add('name', 'duplicate');
                }
                // The costume of a slot is one of the costumes of its gig.
                if ($input->costumeId !== null && $this->database->fetchOne('SELECT 1 FROM gigCostume WHERE gigId = ? AND costumeId = ?', [$gigId, $input->costumeId]) === false) {
                    $errors->add('costumeId', 'invalid');
                }
                $slot = [
                    'name' => $name,
                    'note' => $errors->optionalText('note', $input->note, 1000, lines: true),
                    'costumeId' => $input->costumeId,
                    'updatedByMemberId' => $me->id,
                ];
                $errors->throwIfAny();

                if ($slotId === null) {
                    $this->database->insert('gigSlot', [...$slot, 'gigId' => $gigId, 'position' => count($others) + 1]);
                    $slotId = (int) $this->database->lastInsertId();
                } else {
                    $this->database->update('gigSlot', $slot, ['id' => $slotId]);
                }
                if ($input->position !== null) {
                    $this->gigs->placeSlot($gigId, $slotId, $input->position, $me->id);
                }
            });
        } catch (UniqueConstraintViolationException) {
            // Taken between the check and the save.
            throw new ApiError(422, 'invalidInput', ['name' => 'duplicate']);
        }

        return Json::write($response, $this->gigs->one($me, $gigId), $slotId === null ? 201 : 200);
    }
}
