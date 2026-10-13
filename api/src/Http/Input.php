<?php

declare(strict_types=1);

namespace BrassBand\Http;

use CuyZ\Valinor\MapperBuilder;
use Psr\Http\Message\ServerRequestInterface;

// The only way data sent by the front enters the code.
//
// An action describes what it expects as a small class with typed properties,
// and asks for it here. Valinor fills the class from the JSON body, or throws
// when a property is missing, has the wrong type or is not expected at all;
// ErrorHandler then answers 422 with the faulty fields. Past this line, the
// data has the announced shape.
//
//   final class SignInInput
//   {
//       public function __construct(
//           /** @var non-empty-string */
//           public readonly string $email,
//           /** @var non-empty-string */
//           public readonly string $password,
//       ) {}
//   }
//
//   $input = Input::from($request, SignInInput::class);
final class Input
{
    /**
     * @template T of object
     * @param class-string<T> $class
     * @return T
     */
    public static function from(ServerRequestInterface $request, string $class): object
    {
        // JSON and nothing else. A form of another site can send form data
        // without asking the browser for permission, but it cannot send JSON.
        $isJson = str_starts_with(strtolower($request->getHeaderLine('Content-Type')), 'application/json');
        $body = $request->getParsedBody();
        if (!$isJson || !is_array($body)) {
            throw new ApiError(400, 'invalidBody');
        }

        return (new MapperBuilder())->mapper()->map($class, $body);
    }
}
