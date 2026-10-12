<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/session: signs a member in with their email and password.
//
// Every refusal gives the same answer, 401 "invalidCredentials": unknown email,
// wrong password, member who has left or has no password yet, and sign-in
// locked after too many wrong passwords. Nobody can use this route to learn
// whether an email belongs to a member. The front says both things in one
// sentence: wrong email or password, and wait a while after several tries.
final class SignInAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Sessions $sessions,
        private readonly SessionCookie $cookie,
        private readonly Profile $profile,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, SignInInput::class);

        $memberId = $this->check($input);
        if ($memberId === null) {
            throw new ApiError(401, 'invalidCredentials');
        }

        // A device that signs in again replaces its session instead of adding one.
        $previous = $this->cookie->read($request);
        $previous = $previous === null ? null : $this->sessions->find($previous);
        if ($previous !== null) {
            $this->sessions->close($previous->sessionId);
        }

        $this->sessions->removeExpired();
        [$current, $token] = $this->sessions->signIn($memberId);

        return $this->cookie->write(Json::write($response, $this->profile->of($current)), $token);
    }

    // The id of the member when the email and the password are right and
    // sign-in is not locked; null otherwise.
    private function check(SignInInput $input): ?int
    {
        $email = mb_strtolower(trim($input->email));

        // Nothing this long can be right: refused without looking anything up.
        if (strlen($email) > 254 || Passwords::isTooLong($input->password)) {
            Passwords::spendTime('');

            return null;
        }

        // One sign-in at a time for a given member: the row is locked from the
        // moment the count of wrong passwords is read until it is written
        // back. Without this, tries sent at the same instant would all be
        // judged before any of them is counted.
        return $this->database->transactional(function () use ($email, $input): ?int {
            $member = $this->database->fetchAssociative(
                'SELECT id, email, passwordHash,
                        signInLockedUntil IS NOT NULL AND signInLockedUntil > NOW() AS isLocked
                 FROM member
                 WHERE email = ? AND status IN (?, ?)
                 FOR UPDATE',
                [$email, ...AccessRules::SIGN_IN_STATUSES],
            );

            // The database compares without regard to accents; an email is exact.
            if ($member === false || $member['email'] !== $email || $member['passwordHash'] === null) {
                Passwords::spendTime($input->password);

                return null;
            }

            $isRight = Passwords::matches($input->password, $member['passwordHash']);

            // While sign-in is locked, even the right password is refused, and
            // a wrong one does not extend the lock.
            if ((bool) $member['isLocked']) {
                return null;
            }

            if (!$isRight) {
                (new SignInFailures($this->database))->count((int) $member['id']);

                return null;
            }

            $changes = ['failedSignInCount' => 0, 'signInLockedUntil' => null];
            if (Passwords::isOutdated($member['passwordHash'])) {
                $changes['passwordHash'] = Passwords::hash($input->password);
            }
            $this->database->update('member', $changes, ['id' => $member['id']]);

            return (int) $member['id'];
        });
    }
}
