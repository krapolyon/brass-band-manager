<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/me/proxy: the signed-in member chooses who may answer gigs for
// them, "Peut répondre pour moi" (1.1.0, model/members.md, "Answering for the
// member who designated me"). The member alone: no other address sets it, the
// record a member manager edits included, and only the member and the one
// designated ever receive it.
final class UpdateProxyAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Profile $profile,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $proxyId = Input::from($request, ProxyInput::class)->proxyMemberId;
        $me = CurrentMember::of($request);

        // A current member other than oneself: the profile offers no one
        // else, a member not seeing the invited ones (owner, 2026-11-08).
        if ($proxyId !== null) {
            $isAllowed = $proxyId !== $me->id && (int) $this->database->fetchOne(
                'SELECT COUNT(*) FROM member WHERE id = ? AND status IN (' . AccessRules::SIGN_IN_STATUSES_SQL . ')',
                [$proxyId],
            ) === 1;
            if (!$isAllowed) {
                $errors = new FieldErrors();
                $errors->add('proxyMemberId', 'invalid');
                $errors->throwIfAny();
            }
        }

        $this->database->update(
            'member',
            ['proxyMemberId' => $proxyId, 'updatedByMemberId' => $me->id],
            ['id' => $me->id],
        );

        return Json::write($response, $this->profile->of($me));
    }
}
