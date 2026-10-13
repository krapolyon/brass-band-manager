<?php

declare(strict_types=1);

namespace BrassBand\Http;

use CuyZ\Valinor\Mapper\MappingError;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Exception\HttpException;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;
use Throwable;

// Turns anything thrown while answering a request into a JSON answer of the
// form {"error": "<key>"}. Registered once, in public/index.php.
final class ErrorHandler
{
    public function __construct(private readonly ResponseFactoryInterface $responses)
    {
    }

    public function __invoke(ServerRequestInterface $request, Throwable $thrown): ResponseInterface
    {
        $response = $this->responses->createResponse();

        // A refusal decided by our code.
        if ($thrown instanceof ApiError) {
            $body = ['error' => $thrown->error];
            if ($thrown->fields !== []) {
                $body['fields'] = $thrown->fields;
            }

            return Json::write($response, $body, $thrown->status);
        }

        // Data sent by the front that does not have the expected shape (see Input).
        if ($thrown instanceof MappingError) {
            $fields = [];
            foreach ($thrown->messages()->errors() as $message) {
                $fields[$message->path()] = 'invalid';
            }

            return Json::write($response, ['error' => 'invalidInput', 'fields' => $fields], 422);
        }

        // Refusals decided by Slim: unknown address, wrong method.
        if ($thrown instanceof HttpNotFoundException) {
            return Json::write($response, ['error' => 'notFound'], 404);
        }
        if ($thrown instanceof HttpMethodNotAllowedException) {
            return Json::write($response, ['error' => 'methodNotAllowed'], 405);
        }
        if ($thrown instanceof HttpException) {
            return Json::write($response, ['error' => 'badRequest'], $thrown->getCode());
        }

        // Anything else was not foreseen. The front learns nothing about the
        // cause, and the log gets where it happened but not the message: a
        // database message can quote a value, and values can be personal data.
        error_log(sprintf(
            '%s (code %s) at %s:%d',
            $thrown::class,
            $thrown->getCode(),
            $thrown->getFile(),
            $thrown->getLine(),
        ));

        return Json::write($response, ['error' => 'serverError'], 500);
    }
}
