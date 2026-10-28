<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/transfer/templates: "Télécharger les modèles", the zip of the
// templates of a reprise made for this installation (Templates).
final class TemplatesAction
{
    public function __construct(private readonly Connection $database)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $file = TransferFolder::temporary();
        (new Templates($this->database))->write($file);

        return TransferActions::download($response, $file, 'modeles-reprise.zip');
    }
}
