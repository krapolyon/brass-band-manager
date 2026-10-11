<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Routing\RouteContext;

// Lets a request through when it is about the signed-in member themself, or
// when that member holds a permission. For the routes whose address names a
// member: a member edits their own record, someone who manages members edits
// any.
//
//   $group->put('/api/members/{id:[0-9]+}', $update)
//       ->add(new RequireSelfOrPermission(Permission::MANAGE_MEMBERS));
final class RequireSelfOrPermission implements MiddlewareInterface
{
    public function __construct(private readonly Permission $permission)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $id = RouteContext::fromRequest($request)->getRoute()?->getArgument('id');

        if ((int) $id !== $me->id && !$me->can($this->permission)) {
            throw new ApiError(403, 'forbidden');
        }

        return $handler->handle($request);
    }
}
