<?php

declare(strict_types=1);

namespace BrassBand\Http;

use CuyZ\Valinor\Mapper\MappingError;
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
// Counts the refusals of the route (any 4xx it throws), or every request
// when $countsEveryRequest. Once a visitor reaches $max in the current window,
// the route answers 429 "tooManyRequests" with Retry-After, without running.
//
// The visitor is the network address the server sees (REMOTE_ADDR), never a
// header the request writes itself. It is stored only as an HMAC, mixed with
// the name of the count, in requestLimit, and the rows of windows that have
// ended are deleted at each count.
//
// The counts live in the database, so every PHP process of the host sees
// them, and one statement adds to them: two requests at once both count. A
// database without the table yet (a host waiting for its migration) is not
// limited: sign-in must keep working to reach the migrations screen.
final class RequestLimit implements MiddlewareInterface
{
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

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $visitor = $request->getServerParams()['REMOTE_ADDR'] ?? '';
        $keyHash = hash_hmac('sha256', $this->name . "\n" . (is_string($visitor) ? $visitor : ''), $this->key, true);
        $seconds = $this->minutes * 60;
        $endsAt = (intdiv(time(), $seconds) + 1) * $seconds;
        $window = gmdate('Y-m-d H:i:s', $endsAt);

        try {
            $hits = (int) $this->database->fetchOne(
                'SELECT hits FROM requestLimit WHERE keyHash = ? AND windowEndsAt = ?',
                [$keyHash, $window],
                [ParameterType::BINARY, ParameterType::STRING],
            );
        } catch (TableNotFoundException) {
            return $handler->handle($request);
        }
        if ($hits >= $this->max) {
            throw new ApiError(429, 'tooManyRequests', headers: ['Retry-After' => (string) max(1, $endsAt - time())]);
        }

        if ($this->countsEveryRequest) {
            $this->count($keyHash, $window);

            return $handler->handle($request);
        }

        try {
            return $handler->handle($request);
        } catch (ApiError|MappingError $refusal) {
            if (!$refusal instanceof ApiError || $refusal->status < 500) {
                $this->count($keyHash, $window);
            }
            throw $refusal;
        }
    }

    private function count(string $keyHash, string $window): void
    {
        try {
            $this->database->executeStatement(
                'INSERT INTO requestLimit (keyHash, windowEndsAt) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE hits = hits + 1',
                [$keyHash, $window],
                [ParameterType::BINARY, ParameterType::STRING],
            );
            $this->database->executeStatement('DELETE FROM requestLimit WHERE windowEndsAt <= UTC_TIMESTAMP()');
        } catch (TableNotFoundException) {
            // The install creates the tables in the request it is counting.
        }
    }
}
