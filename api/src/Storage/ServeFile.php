<?php

declare(strict_types=1);

namespace BrassBand\Storage;

use BrassBand\Http\ApiError;
use Psr\Http\Message\ResponseInterface;

// Writes a stored image in an answer, with the headers that make it safe to
// send a file a member gave.
final class ServeFile
{
    /**
     * @param string $file Where the file is on the disk (Files::find)
     * @param string $cache What browsers and proxies may keep: the value of Cache-Control
     */
    public static function write(ResponseInterface $response, string $file, string $cache): ResponseInterface
    {
        // The file may have been replaced since it was found.
        $content = @file_get_contents($file);
        $contentType = Images::CONTENT_TYPES[pathinfo($file, PATHINFO_EXTENSION)] ?? null;
        if ($content === false || $contentType === null) {
            throw new ApiError(404, 'notFound');
        }
        $response->getBody()->write($content);

        return $response
            ->withHeader('Content-Type', $contentType)
            ->withHeader('Cache-Control', $cache)
            // The file is what its type says, never a page.
            ->withHeader('X-Content-Type-Options', 'nosniff')
            // Shown by this app only, never embedded by another site.
            ->withHeader('Cross-Origin-Resource-Policy', 'same-origin')
            // An SVG can carry scripts. Shown as an image it runs none; opened
            // by its address, this forbids it to run or to load anything.
            ->withHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
}
