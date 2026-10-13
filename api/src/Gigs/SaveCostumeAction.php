<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Http\Text;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/costumes and PUT /api/costumes/{id}: adds a costume, or renames
// and moves one. Asks for MANAGE_COSTUMES. Answers with every costume, since
// moving one renumbers the others.
final class SaveCostumeAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Costumes $costumes,
    ) {
    }

    /**
     * @param array{id?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $id = isset($arguments['id']) ? (int) $arguments['id'] : null;
        if ($id !== null && $this->database->fetchOne('SELECT 1 FROM costume WHERE id = ?', [$id]) === false) {
            throw new ApiError(404, 'notFound');
        }
        $input = Input::from($request, CostumeInput::class);

        $errors = new FieldErrors();
        $errors->text('name', $input->name, Costumes::NAME_MAX_LENGTH);
        $name = Text::clean($input->name);
        // Unique whatever its case and its accents, as the database compares it.
        if ($this->database->fetchOne('SELECT 1 FROM costume WHERE name = ? AND id <> ?', [$name, $id ?? 0]) !== false) {
            $errors->add('name', 'duplicate');
        }
        $errors->throwIfAny();

        try {
            $this->database->transactional(function () use ($id, $name, $input, $me): void {
                if ($id === null) {
                    $this->database->insert('costume', [
                        'name' => $name,
                        'position' => (int) $this->database->fetchOne('SELECT COALESCE(MAX(position), 0) + 1 FROM costume'),
                        'updatedByMemberId' => $me->id,
                    ]);
                    $id = (int) $this->database->lastInsertId();
                } else {
                    $this->database->update('costume', ['name' => $name, 'updatedByMemberId' => $me->id], ['id' => $id]);
                }
                if ($input->position !== null) {
                    $this->costumes->place($id, $input->position, $me->id);
                }
            });
        } catch (UniqueConstraintViolationException) {
            // Taken between the check and the save.
            throw new ApiError(422, 'invalidInput', ['name' => 'duplicate']);
        }

        return Json::write($response, $this->costumes->all(), $id === null ? 201 : 200);
    }
}
