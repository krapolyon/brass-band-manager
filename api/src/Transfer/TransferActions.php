<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

// The actions of the export, the import and the reprise are in the files of
// this folder, one per address (routes.php, all for TRANSFER_DATA, the admin
// only). This file holds what they share to answer a file.

use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Stream;

final class TransferActions
{
    /**
     * A zip written to a temporary file, sent as a download. The file is
     * opened, then removed from the folder: it lives until it has been sent,
     * and nothing is left behind whatever happens next.
     */
    public static function download(ResponseInterface $response, string $file, string $name): ResponseInterface
    {
        $handle = fopen($file, 'rb');
        $size = filesize($file);
        @unlink($file);
        if ($handle === false || $size === false) {
            throw new \RuntimeException('The zip cannot be read');
        }

        return $response
            ->withBody(new Stream($handle))
            ->withHeader('Content-Type', 'application/zip')
            ->withHeader('Content-Length', (string) $size)
            ->withHeader('Content-Disposition', 'attachment; filename="' . $name . '"')
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('X-Content-Type-Options', 'nosniff');
    }
}
