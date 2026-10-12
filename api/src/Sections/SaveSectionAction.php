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

// POST /api/sections and PUT /api/sections/{id}: adds a section, or renames
// one, moves it and sets its pictogram. Asks for MANAGE_SECTIONS. Answers with every section, since
// moving one renumbers the others.
final class SaveSectionAction
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
            $this->sections->mustExist('section', $id);
        }
        $input = Input::from($request, SectionInput::class);
        $name = $this->sections->name('section', $input->name, $id);
        if ($input->icon !== null && !SectionIcons::exists($input->icon)) {
            throw new ApiError(422, 'invalidInput', ['icon' => 'invalid']);
        }

        try {
            $this->database->transactional(function () use ($id, $name, $input, $me): void {
                if ($id === null) {
                    $this->database->insert('section', [
                        'name' => $name,
                        'icon' => $input->icon,
                        'position' => $this->sections->end('section', null),
                        'updatedByMemberId' => $me->id,
                    ]);
                    $id = (int) $this->database->lastInsertId();
                } else {
                    $this->database->update(
                        'section',
                        ['name' => $name, 'icon' => $input->icon, 'updatedByMemberId' => $me->id],
                        ['id' => $id],
                    );
                }
                if ($input->position !== null) {
                    $this->sections->place('section', $id, $input->position, null, $me->id);
                }
            });
        } catch (UniqueConstraintViolationException) {
            // Taken between the check and the save.
            throw new ApiError(422, 'invalidInput', ['name' => 'duplicate']);
        }

        return Json::write($response, $this->sections->all(forManaging: true), $id === null ? 201 : 200);
    }
}
