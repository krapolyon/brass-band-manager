<?php

declare(strict_types=1);

namespace BrassBand\Http;

use Exception;

// A refusal the front is meant to receive: an HTTP status and a key.
// The key is translated by the front (locales, under "errors"); the server
// writes no sentence. Throw it from anywhere, ErrorHandler turns it into the
// answer:
//
//   throw new ApiError(409, 'alreadyInstalled');
//
// For data that has the right shape but a wrong content, use FieldErrors,
// which throws the 422 "invalidInput" with the faulty fields.
final class ApiError extends Exception
{
    /**
     * @param array<string, string> $fields For "invalidInput": field path => what is wrong with it
     */
    public function __construct(
        public readonly int $status,
        public readonly string $error,
        public readonly array $fields = [],
    ) {
        parent::__construct($error);
    }
}
