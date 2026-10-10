<?php

declare(strict_types=1);

namespace BrassBand\Http;

use Exception;

// A refusal the front is meant to receive: an HTTP status and a key.
// The key is translated by the front (locales, under "errors"); the server
// writes no sentence. Throw it from anywhere, ErrorHandler turns it into the
// answer:
//
//   throw new ApiError(409, 'emailAlreadyUsed');
final class ApiError extends Exception
{
    public function __construct(
        public readonly int $status,
        public readonly string $error,
    ) {
        parent::__construct($error);
    }
}
