<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use BrassBand\Members\MemberRecord;
use BrassBand\Members\PhotoStore;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
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
// An invited member sends their record, their photo and their accessibility
// options in the same request: all of it is saved together, or nothing is.
// A member who only forgot their password may send none of that: a password
// link is not a way to rewrite a record.
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
        private readonly MemberRecord $record,
        private readonly PhotoStore $photos,
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
        if ($found['status'] !== 'INVITED' && $input->completesAnAccount()) {
            throw new ApiError(409, 'notInvited');
        }
        $errors = new FieldErrors();
        Passwords::check($errors, 'password', $input->password);
        $photo = $input->photo === null ? null : $this->photos->read($errors, 'photo', $input->photo);
        $errors->throwIfAny();
        // The record is checked once here, so that its faults are said before
        // anything is held, and again below, with the member held.
        // Counted like the check of the first step: it tells as much.
        if ($input->member !== null) {
            $this->links->checkRecord($this->record, $input->member, $found['memberId']);
        }

        // A device signed in as someone else is signed out of that account.
        $previous = $this->cookie->read($request);
        $previous = $previous === null ? null : $this->sessions->find($previous);

        try {
            [$current, $token] = $this->database->transactional(function () use ($input, $found, $previous, $photo): array {
                // The member first, then their link: the same order as the
                // actions that change a member, so that none waits for the other
                // for ever. Held until the end: of two uses sent at the same
                // instant, the second finds no link.
                $this->database->fetchOne('SELECT id FROM member WHERE id = ? FOR UPDATE', [$found['memberId']]);
                $link = $this->links->find($input->token, lock: true);
                if ($link === null || $link['memberId'] !== $found['memberId']) {
                    throw new ApiError(404, 'invalidPasswordLink');
                }

                // Judged again with the link held: the invitation may have been
                // completed by another request since the first look.
                if ($link['status'] !== 'INVITED' && $input->completesAnAccount()) {
                    throw new ApiError(409, 'notInvited');
                }
                $record = $input->member === null ? [] : $this->record->check($input->member, $link['memberId']);

                $this->database->update(
                    'member',
                    [
                        ...$record,
                        ...($input->accessibility?->columns() ?? []),
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
                $session = $this->sessions->signIn($link['memberId']);

                // The photo last: it writes and deletes files, which nothing
                // brings back if what follows fails.
                if ($photo !== null || $input->removePhoto) {
                    $this->photos->replace($link['memberId'], $photo, $link['memberId']);
                }

                return $session;
            });
        } catch (UniqueConstraintViolationException) {
            // A nickname or an email taken between the check and the save:
            // the check now says which.
            if ($input->member !== null) {
                $this->record->check($input->member, $found['memberId']);
            }
            throw new ApiError(422, 'invalidInput', ['nickname' => 'duplicate']);
        }

        $this->links->removeExpired();

        return $this->cookie->write(Json::write($response, $this->profile->of($current)), $token);
    }
}
