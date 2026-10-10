<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

// Lets a request through only when the signed-in member holds a permission.
// Attached in routes.php to a route, which must also be behind RequireSession:
//
//   $group->patch('/api/band', $updateBand)->add(new RequirePermission(Permission::MANAGE_BAND));
final class RequirePermission implements MiddlewareInterface
{
    public function __construct(private readonly Permission $permission)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!CurrentMember::of($request)->can($this->permission)) {
            throw new ApiError(403, 'forbidden');
        }

        return $handler->handle($request);
    }
}
