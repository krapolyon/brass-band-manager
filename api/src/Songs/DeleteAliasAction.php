<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/instrumentAliases/{id}: takes a known spelling away from its
// instrument. Asks for MANAGE_SONGS. Answers with the instrument and the
// spellings it keeps, as in the list.
final class DeleteAliasAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly InstrumentAliases $aliases,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $instrumentId = $this->database->fetchOne('SELECT instrumentId FROM instrumentAlias WHERE id = ?', [(int) $arguments['id']]);
        if ($instrumentId === false) {
            throw new ApiError(404, 'notFound');
        }
        $this->database->delete('instrumentAlias', ['id' => (int) $arguments['id']]);

        return Json::write($response, $this->aliases->of((int) $instrumentId));
    }
}
