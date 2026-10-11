<?php

declare(strict_types=1);

namespace BrassBand\Sections;

use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/sections/{id}: deletes a section that holds no instrument.
// Asks for MANAGE_SECTIONS.
final class DeleteSectionAction
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
        $this->sections->mustExist('section', (int) $arguments['id']);

        try {
            // The database itself refuses while an instrument refers to the section.
            $this->database->delete('section', ['id' => (int) $arguments['id']]);
        } catch (ForeignKeyConstraintViolationException) {
            throw new ApiError(409, 'sectionNotEmpty');
        }

        return Json::write($response, $this->sections->all());
    }
}
