<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\PasswordLinks;
use BrassBand\Access\Role;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/members/{id}/roles: sets the roles of a member, all at once. Asks
// for MANAGE_ROLES.
final class SetRolesAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Members $members,
        private readonly PasswordLinks $links,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);

        $errors = new FieldErrors();
        $roles = [];
        $sent = Input::from($request, RolesInput::class)->roles;
        if (count($sent) > 2 * count(Role::cases())) {
            throw new ApiError(422, 'invalidInput', ['roles' => 'invalid']);
        }
        foreach ($sent as $index => $value) {
            $role = Role::tryFrom($value);
            if ($role === null) {
                $errors->add("roles.{$index}", 'invalid');
            } elseif (!in_array($role, $roles, true)) {
                $roles[] = $role;
            }
        }
        $errors->throwIfAny();

        $this->database->transactional(function () use ($me, $roles, $arguments): void {
            $admins = $this->members->lockCurrentAdmins();
            $target = $this->members->target((int) $arguments['id'], lock: true);

            // The roles of a member who left were erased; they get roles again once back.
            if ($target['status'] === 'LEFT') {
                throw new ApiError(409, 'memberLeft');
            }
            // Always one admin: the last one cannot lose the role.
            if ($admins === [$target['id']] && !in_array(Role::ADMIN, $roles, true)) {
                throw new ApiError(409, 'lastAdmin');
            }

            Members::replaceRoles($this->database, $this->links, $target['id'], array_map(fn (Role $role) => $role->value, $roles), $me->id);
        });

        return Json::write($response, $this->members->oneVisibleTo($me, (int) $arguments['id']));
    }
}
