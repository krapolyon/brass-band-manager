<?php

declare(strict_types=1);

namespace BrassBand\Access;

use LogicException;
use Psr\Http\Message\ServerRequestInterface;

// The member who makes the request. Built by RequireSession, which attaches it
// to the request; an action behind RequireSession reads it with:
//
//   $me = CurrentMember::of($request);
//   $me->id
//   $me->can(Permission::MANAGE_GIGS)
final class CurrentMember
{
    /**
     * @param list<Role> $roles
     */
    public function __construct(
        public readonly int $id,
        public readonly int $sessionId,
        public readonly array $roles,
    ) {
    }

    public function can(Permission $permission): bool
    {
        return $permission->isGrantedTo($this->roles);
    }

    /**
     * @return list<string> Values of the permissions this member holds, for the front
     */
    public function permissions(): array
    {
        $held = array_filter(Permission::cases(), fn (Permission $permission) => $this->can($permission));

        return array_values(array_map(fn (Permission $permission) => $permission->value, $held));
    }

    public static function of(ServerRequestInterface $request): self
    {
        $member = $request->getAttribute(self::class);
        if (!$member instanceof self) {
            // A programming mistake, not a refusal: the route is missing RequireSession.
            throw new LogicException('This route reads the current member but is not behind RequireSession.');
        }

        return $member;
    }
}
