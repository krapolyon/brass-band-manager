<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/passwordLink/use: chooses a password with a password link. Sets
// the password, makes an invited member active, deletes the link and every
// session of the member, and signs the member in (model/members.md, entry 3).
//
// Public: whoever holds the link is not signed in yet.
final class UsePasswordLinkAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly PasswordLinks $links,
        private readonly Sessions $sessions,
        private readonly SessionCookie $cookie,
        private readonly Profile $profile,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, UsePasswordLinkInput::class);

        // The link is judged first: a password is not commented on for someone who holds no link.
        $found = $this->links->find($input->token);
        if ($found === null) {
            throw new ApiError(404, 'invalidPasswordLink');
        }
        $errors = new FieldErrors();
        Passwords::check($errors, 'password', $input->password);
        $errors->throwIfAny();

        // A device signed in as someone else is signed out of that account.
        $previous = $this->cookie->read($request);
        $previous = $previous === null ? null : $this->sessions->find($previous);

        [$current, $token] = $this->database->transactional(function () use ($input, $found, $previous): array {
            // The member first, then their link: the same order as the
            // actions that change a member, so that none waits for the other
            // for ever. Held until the end: of two uses sent at the same
            // instant, the second finds no link.
            $this->database->fetchOne('SELECT id FROM member WHERE id = ? FOR UPDATE', [$found['memberId']]);
            $link = $this->links->find($input->token, lock: true);
            if ($link === null || $link['memberId'] !== $found['memberId']) {
                throw new ApiError(404, 'invalidPasswordLink');
            }

            $this->database->update(
                'member',
                [
                    'passwordHash' => Passwords::hash($input->password),
                    'status' => $link['status'] === 'INVITED' ? 'ACTIVE' : $link['status'],
                    // Whoever forgot their password has often locked sign-in while trying.
                    'failedSignInCount' => 0,
                    'signInLockedUntil' => null,
                    'updatedByMemberId' => $link['memberId'],
                ],
                ['id' => $link['memberId']],
            );
            $this->links->cancel($link['memberId']);
            $this->sessions->closeAll($link['memberId']);
            if ($previous !== null) {
                $this->sessions->close($previous->sessionId);
            }

            // Opened here, with the member still held: they cannot leave in between.
            return $this->sessions->signIn($link['memberId']);
        });

        $this->links->removeExpired();

        return $this->cookie->write(Json::write($response, $this->profile->of($current)), $token);
    }
}
