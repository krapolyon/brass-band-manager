<?php

declare(strict_types=1);

namespace BrassBand\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

// Refuses a request whose body is larger than anything the app receives,
// before the body is read: without it, anyone could make the server read and
// decode a body of any size, signed in or not.
//
// The largest JSON the API receives is a logo with its icons: 2 MB of image
// become about 2.7 MB once written in base64, and each icon is 1 MB at most.
// The files of a song are sent as they are, one per request, and the largest
// (a recording, a MuseScore file) is 10 MB: FileBody then judges each kind.
final class BodyLimit implements MiddlewareInterface
{
    public const MAX_BYTES = 8_000_000;
    public const MAX_FILE_BYTES = 10_000_000;

    // The addresses a file of a song is sent to (routes.php).
    private const FILE_ADDRESS = '#\A/api/songs/[0-9]+/(cover|museScore|midi|musicXml|audio|parts/[0-9]+)\z#';

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $length = $request->getHeaderLine('Content-Length');

        if ($length === '') {
            // A request that sends data says how much. One that does not is
            // either without a body, or hiding its size.
            if (in_array($request->getMethod(), ['POST', 'PUT', 'PATCH'], true)) {
                throw new ApiError(411, 'lengthRequired');
            }
        } elseif (!ctype_digit($length) || (int) $length > $this->limit($request)) {
            throw new ApiError(413, 'bodyTooLarge');
        }

        return $handler->handle($request);
    }

    private function limit(ServerRequestInterface $request): int
    {
        $isFile = $request->getMethod() === 'PUT' && preg_match(self::FILE_ADDRESS, $request->getUri()->getPath()) === 1;

        return $isFile ? self::MAX_FILE_BYTES : self::MAX_BYTES;
    }
}
