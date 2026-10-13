<?php

declare(strict_types=1);

namespace BrassBand\Http;

use Psr\Http\Message\ServerRequestInterface;

// The one exception to "JSON and nothing else" (see Input): a file of a song
// is sent as it is, alone in the body of its request. A recording of 10 MB
// written in base64 inside JSON would weigh a third more and be decoded
// whole in memory twice.
//
// The request must announce "application/octet-stream". Like JSON, this is a
// type that a page of another site cannot send without the browser asking
// the server first, which the app never allows.
//
//   $content = FileBody::from($request, 5_000_000);
final class FileBody
{
    public const CONTENT_TYPE = 'application/octet-stream';

    public static function from(ServerRequestInterface $request, int $maxBytes): string
    {
        if (strtolower($request->getHeaderLine('Content-Type')) !== self::CONTENT_TYPE) {
            throw new ApiError(400, 'invalidBody');
        }
        // What the request announces, then what it really holds.
        if ((int) $request->getHeaderLine('Content-Length') > $maxBytes) {
            throw new ApiError(413, 'fileTooBig');
        }
        $content = (string) $request->getBody();
        if (strlen($content) > $maxBytes) {
            throw new ApiError(413, 'fileTooBig');
        }
        if ($content === '') {
            throw new ApiError(422, 'invalidFile');
        }

        return $content;
    }
}
