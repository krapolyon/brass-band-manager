<?php

declare(strict_types=1);

namespace BrassBand\Sections;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/instruments and PUT /api/instruments/{id}: adds an instrument to
// a section, or renames it, moves it inside its section or to another one.
// Asks for MANAGE_SECTIONS. Its members follow an instrument that changes
// section: the section of a member is always the one of their instrument.
final class SaveInstrumentAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Sections $sections,
    ) {
    }

    /**
     * @param array{id?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $id = isset($arguments['id']) ? (int) $arguments['id'] : null;
        if ($id !== null) {
            $this->sections->mustExist('instrument', $id);
        }
        $input = Input::from($request, InstrumentInput::class);
        $name = $this->sections->name('instrument', $input->name, $id);
        if ((int) $this->database->fetchOne('SELECT COUNT(*) FROM section WHERE id = ?', [$input->sectionId]) === 0) {
            throw new ApiError(422, 'invalidInput', ['sectionId' => 'invalid']);
        }

        try {
            $this->database->transactional(function () use ($id, $name, $input, $me): void {
                $previousSectionId = $id === null
                    ? null
                    : (int) $this->database->fetchOne('SELECT sectionId FROM instrument WHERE id = ? FOR UPDATE', [$id]);
                $changesSection = $previousSectionId !== $input->sectionId;
                $values = ['name' => $name, 'sectionId' => $input->sectionId, 'updatedByMemberId' => $me->id];

                if ($id === null) {
                    $this->database->insert('instrument', [...$values, 'position' => $this->sections->end('instrument', $input->sectionId)]);
                    $id = (int) $this->database->lastInsertId();
                } else {
                    // One that changes section goes to the end of the new one, unless a place is asked.
                    if ($changesSection) {
                        $values['position'] = $this->sections->end('instrument', $input->sectionId);
                    }
                    $this->database->update('instrument', $values, ['id' => $id]);
                }
                if ($input->position !== null) {
                    $this->sections->place('instrument', $id, $input->position, $input->sectionId, $me->id);
                }
            });
        } catch (UniqueConstraintViolationException) {
            throw new ApiError(422, 'invalidInput', ['name' => 'duplicate']);
        }

        return Json::write($response, $this->sections->all(forManaging: true), isset($arguments['id']) ? 200 : 201);
    }
}
