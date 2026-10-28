<?php

declare(strict_types=1);

namespace BrassBand\Http;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\TableNotFoundException;
use Doctrine\DBAL\ParameterType;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

// Limits what one visitor does on a public address (model/members.md, entry
// 3, "Limits per visitor"). Added in routes.php to the routes it guards:
//
//   $app->post('/api/session', ...)->add($refusals);
//
// Counts the refusals of a wrong secret (a wrong password, install key or
// link: 401, 403, 404), never a form refused for its content, or every
// request when $countsEveryRequest. Once a visitor reaches $max in the
// current window, the route answers 429 "tooManyRequests" with Retry-After,
// without running.
//
// The visitor is the network address the server sees (REMOTE_ADDR), never a
// header the request writes itself; for IPv6, its first half (/64), which
// one device usually holds whole. It is stored only as an HMAC, mixed with
// the name of the count, in requestLimit, and the rows of windows that have
// ended are deleted at each check.
//
// The counts live in the database, so every PHP process of the host sees
// them. Every request is counted before it runs; a refusal is counted once
// it is known, so requests sent at the same moment may each pass before the
// count, a few more than the limit. A database without the table yet (a
// host waiting for its migration, or before the install) is not counted:
// sign-in must keep working to reach the migrations screen. A wrong secret
// is then answered after a second, which slows a guess of the install key.
final class RequestLimit implements MiddlewareInterface
{
    // The refusals of a wrong secret.
    private const COUNTED = [401, 403, 404];

    public function __construct(
        private readonly Connection $database,
        #[\SensitiveParameter] private readonly string $key,
        private readonly string $name,
        private readonly int $max,
        private readonly int $minutes,
        private readonly bool $countsEveryRequest = false,
    ) {
    }

    // The key of the hashes: derived from a secret of config.php, so that a
    // copy of the database does not give the addresses back by trying them
    // all. The encryption key exists on every installed instance; before the
    // install, the install key stands in.
    /**
     * @param array<string, mixed> $config
     */
    public static function keyFrom(array $config): string
    {
        $secret = is_string($config['encryptionKey'] ?? null) && trim($config['encryptionKey']) !== ''
            ? trim($config['encryptionKey'])
            : (is_string($config['installKey'] ?? null) ? $config['installKey'] : '');

        return hash_hmac('sha256', 'requestLimit', $secret, true);
    }

    /** The visitor as counted: an IPv4 address whole, an IPv6 address by its first 64 bits. */
    public static function visitorOf(string $address): string
    {
        $bytes = @inet_pton($address);

        return $bytes !== false && strlen($bytes) === 16 ? substr($bytes, 0, 8) : $address;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $address = $request->getServerParams()['REMOTE_ADDR'] ?? '';
        $visitor = self::visitorOf(is_string($address) ? $address : '');
        $keyHash = hash_hmac('sha256', $this->name . "\n" . $visitor, $this->key, true);
        $seconds = $this->minutes * 60;
        $endsAt = (intdiv(time(), $seconds) + 1) * $seconds;
        $window = gmdate('Y-m-d H:i:s', $endsAt);
        $refuse = fn () => new ApiError(429, 'tooManyRequests', headers: ['Retry-After' => (string) max(1, $endsAt - time())]);

        try {
            $this->database->executeStatement('DELETE FROM requestLimit WHERE windowEndsAt <= UTC_TIMESTAMP()');
            if ($this->countsEveryRequest) {
                // Counted first, then read: two requests at once cannot both pass the last place.
                $this->count($keyHash, $window);
            }
            $hits = (int) $this->database->fetchOne(
                'SELECT hits FROM requestLimit WHERE keyHash = ? AND windowEndsAt = ?',
                [$keyHash, $window],
                [ParameterType::BINARY, ParameterType::STRING],
            );
        } catch (TableNotFoundException) {
            return $this->withoutCount($request, $handler);
        }

        if ($this->countsEveryRequest) {
            if ($hits > $this->max) {
                throw $refuse();
            }

            return $handler->handle($request);
        }

        if ($hits >= $this->max) {
            throw $refuse();
        }
        try {
            return $handler->handle($request);
        } catch (ApiError $refusal) {
            if (in_array($refusal->status, self::COUNTED, true)) {
                try {
                    $this->count($keyHash, $window);
                } catch (TableNotFoundException) {
                    // The install creates the tables in the request it is counting.
                }
            }
            throw $refusal;
        }
    }

    private function withoutCount(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        try {
            return $handler->handle($request);
        } catch (ApiError $refusal) {
            if (in_array($refusal->status, self::COUNTED, true)) {
                sleep(1);
            }
            throw $refusal;
        }
    }

    private function count(string $keyHash, string $window): void
    {
        $this->database->executeStatement(
            'INSERT INTO requestLimit (keyHash, windowEndsAt) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE hits = hits + 1',
            [$keyHash, $window],
            [ParameterType::BINARY, ParameterType::STRING],
        );
    }
}
