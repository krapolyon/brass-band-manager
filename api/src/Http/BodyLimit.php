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
// The largest thing the API receives is a logo with its icons: 2 MB of image
// become about 2.7 MB once written in base64, and each icon is 1 MB at most.
final class BodyLimit implements MiddlewareInterface
{
    public const MAX_BYTES = 8_000_000;

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $length = $request->getHeaderLine('Content-Length');

        if ($length === '') {
            // A request that sends data says how much. One that does not is
            // either without a body, or hiding its size.
            if (in_array($request->getMethod(), ['POST', 'PUT', 'PATCH'], true)) {
                throw new ApiError(411, 'lengthRequired');
            }
        } elseif (!ctype_digit($length) || (int) $length > self::MAX_BYTES) {
            throw new ApiError(413, 'bodyTooLarge');
        }

        return $handler->handle($request);
    }
}
