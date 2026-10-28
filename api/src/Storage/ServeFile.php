<?php

declare(strict_types=1);

namespace BrassBand\Storage;

use BrassBand\Http\ApiError;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Stream;

// Writes a stored file in an answer, with the headers that make it safe to
// send a file a member gave.
final class ServeFile
{
    // The files of songs, by the extension they are stored under.
    private const CONTENT_TYPES = [
        'pdf' => 'application/pdf',
        'mp3' => 'audio/mpeg',
        'm4a' => 'audio/mp4',
        'mid' => 'audio/midi',
        'mscz' => 'application/octet-stream',
        'musicxml' => 'application/vnd.recordare.musicxml+xml',
        'mxl' => 'application/vnd.recordare.musicxml',
    ];

    /**
     * A file served to signed-in members only: an image, a recording, a
     * score. Kept by the browser of the member only, never by a shared
     * cache, and asked again each time: the browser sends back the version it
     * holds, and when it is still the right one the answer carries no file.
     *
     * A recording is read piece by piece: a player asks for a range of bytes,
     * and an iPhone plays nothing from a server that does not answer ranges.
     *
     * @param string $file Where the file is on the disk (Files::find)
     * @param string $version What changes when the file is replaced (Files::version)
     * @param string|null $downloadName When given, the browser saves the file under this name instead of showing it
     */
    public static function privately(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $file,
        string $version,
        ?string $downloadName = null,
    ): ResponseInterface {
        $extension = pathinfo($file, PATHINFO_EXTENSION);
        $contentType = self::CONTENT_TYPES[$extension] ?? Images::CONTENT_TYPES[$extension] ?? null;
        $size = @filesize($file);
        $handle = $contentType === null || $size === false ? false : @fopen($file, 'rb');
        if ($contentType === null || $size === false || $handle === false) {
            throw new ApiError(404, 'notFound');
        }

        $etag = '"' . $version . '"';
        $response = $response
            ->withHeader('ETag', $etag)
            ->withHeader('Cache-Control', 'private, no-cache')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Cross-Origin-Resource-Policy', 'same-origin')
            ->withHeader('Content-Security-Policy', "default-src 'none'")
            ->withHeader('Accept-Ranges', 'bytes');
        if ($request->getHeaderLine('If-None-Match') === $etag) {
            fclose($handle);

            return $response->withStatus(304);
        }

        $response = $response->withHeader('Content-Type', $contentType);
        if ($downloadName !== null) {
            // The name is given twice: plainly for old browsers, and with its
            // accents for the others.
            $plain = preg_replace('/[^A-Za-z0-9 ._-]/u', '_', $downloadName);
            $response = $response->withHeader(
                'Content-Disposition',
                "attachment; filename=\"{$plain}\"; filename*=UTF-8''" . rawurlencode($downloadName),
            );
        }

        // "bytes=100-199", "bytes=100-" or "bytes=-500": one range. Anything
        // else gets the whole file.
        if (preg_match('/\Abytes=(\d*)-(\d*)\z/', $request->getHeaderLine('Range'), $range) === 1 && $range[1] . $range[2] !== '') {
            $first = $range[1] === '' ? max(0, $size - (int) $range[2]) : (int) $range[1];
            $last = $range[1] === '' || $range[2] === '' ? $size - 1 : min((int) $range[2], $size - 1);
            if ($first > $last || $first >= $size) {
                fclose($handle);

                return $response->withStatus(416)->withHeader('Content-Range', "bytes */{$size}");
            }
            fseek($handle, $first);
            $response->getBody()->write((string) fread($handle, max(1, $last - $first + 1)));
            fclose($handle);

            return $response
                ->withStatus(206)
                ->withHeader('Content-Range', "bytes {$first}-{$last}/{$size}")
                ->withHeader('Content-Length', (string) ($last - $first + 1));
        }

        return $response->withBody(new Stream($handle))->withHeader('Content-Length', (string) $size);
    }

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
            // Public, and shown outside the app too: in an email, read by a
            // mail client from another origin, and on the home screen of a
            // phone. same-origin would hide the icon of every email.
            ->withHeader('Cross-Origin-Resource-Policy', 'cross-origin')
            // An SVG can carry scripts. Shown as an image it runs none; opened
            // by its address, this forbids it to run or to load anything.
            ->withHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
}
