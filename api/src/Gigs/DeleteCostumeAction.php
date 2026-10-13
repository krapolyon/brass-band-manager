<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/costumes/{id}: deletes a costume no gig uses. Asks for
// MANAGE_COSTUMES.
final class DeleteCostumeAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Costumes $costumes,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        if ($this->database->fetchOne('SELECT 1 FROM costume WHERE id = ?', [(int) $arguments['id']]) === false) {
            throw new ApiError(404, 'notFound');
        }
        try {
            // The database itself refuses while a gig, even one already played, has the costume.
            $this->database->delete('costume', ['id' => (int) $arguments['id']]);
        } catch (ForeignKeyConstraintViolationException) {
            throw new ApiError(409, 'costumeInUse');
        }

        return Json::write($response, $this->costumes->all());
    }
}
