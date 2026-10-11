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
     * True when this member may do everything that someone holding these
     * roles may do. Acting on the access of another member (their email,
     * their password link, their status) asks for it: otherwise, someone who
     * manages members could take over the account of an admin and become one.
     *
     * @param list<Role> $roles
     */
    public function covers(array $roles): bool
    {
        foreach (Permission::cases() as $permission) {
            if ($permission->isGrantedTo($roles) && !$this->can($permission)) {
                return false;
            }
        }

        return true;
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
