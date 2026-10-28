<?php

declare(strict_types=1);

namespace BrassBand\Sections;

use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/instruments/{id}: deletes an instrument no record holds. Asks
// for MANAGE_SECTIONS. The record of an invited member, or of a member who
// left, holds its instrument too: it is kept with their name
// (model/members.md, "Life cycle").
final class DeleteInstrumentAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Sections $sections,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $this->sections->mustExist('instrument', (int) $arguments['id']);

        try {
            // The database itself refuses while a member refers to the instrument.
            $this->database->delete('instrument', ['id' => (int) $arguments['id']]);
        } catch (ForeignKeyConstraintViolationException) {
            throw new ApiError(409, 'instrumentInUse');
        }

        return Json::write($response, $this->sections->all(forManaging: true));
    }
}
