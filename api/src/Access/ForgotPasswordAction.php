<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\AfterResponse;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Mail\Emails;
use BrassBand\Mail\Mailer;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/passwordLink/request: forgotten password. A person gives an email
// address; if it is the one of a current member, the app creates a password
// link, valid one hour, and sends it there. Rules: model/members.md,
// "Forgotten password" and entry 3.
//
// Public, and built so that it tells nothing about who is a member:
//   - the answer is the same whatever the address;
//   - the email leaves after the answer (AfterResponse), so the time of the
//     answer does not depend on it;
//   - a member gets one email per 5 minutes at most, so that this route
//     cannot be used to flood a mailbox.
final class ForgotPasswordAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly PasswordLinks $links,
        private readonly Mailer $mailer,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, ForgotPasswordInput::class);

        // Not a secret: the screen reads the same thing from GET /api/band.
        if (!$this->mailer->canSend()) {
            throw new ApiError(409, 'emailUnavailable');
        }

        $email = mb_strtolower(trim($input->email));
        // What is not an email address belongs to nobody: it is not looked up.
        $errors = new FieldErrors();
        $errors->email('email', $email);
        $link = $errors->isEmpty() ? $this->database->transactional(fn () => $this->createLink($email)) : null;
        if ($link !== null) {
            $mailer = $this->mailer;
            $links = $this->links;
            AfterResponse::add(static function () use ($mailer, $links, $link): void {
                $text = Emails::text('passwordLink', $link['language'], [
                    'band' => $link['band'],
                    'link' => $mailer->url('/password#' . $link['token']),
                ]);
                try {
                    // To the address of the member as the database holds it,
                    // never to the one that was typed.
                    $mailer->send($link['email'], $link['band'], $text['subject'], $text['body']);
                } catch (\Throwable $failure) {
                    // The email did not leave: the link nobody received is
                    // removed, so that the member can ask again at once.
                    $links->cancel($link['memberId']);
                    throw $failure;
                }
            });
        }

        // The length lets the browser know it has the whole answer, on a
        // server that cannot close it before the email is sent.
        $answer = Json::write($response, ['sent' => true]);

        return $answer->withHeader('Content-Length', (string) $answer->getBody()->getSize());
    }

    /**
     * Creates the link of the current member who has this address, unless an
     * email was sent to them in the last minutes.
     *
     * @return array{memberId: int, email: string, token: string, language: string, band: string}|null Null: no email is to be sent
     */
    private function createLink(string $email): ?array
    {
        // The row of the member is held, so that two requests at the same
        // instant send one email.
        $member = $this->database->fetchAssociative(
            'SELECT id, email, language FROM member WHERE email = ? AND status IN (?, ?) FOR UPDATE',
            [$email, ...AccessRules::SIGN_IN_STATUSES],
        );
        // The database compares addresses without regard to accents: "é" is
        // "e" for it. Here the address must be the stored one, character for
        // character, or a look-alike address would receive the link of a member.
        if ($member === false || !hash_equals((string) $member['email'], $email)) {
            return null;
        }
        if ($this->links->wasEmailedRecently((int) $member['id'])) {
            return null;
        }

        return [
            'memberId' => (int) $member['id'],
            'email' => (string) $member['email'],
            'token' => $this->links->create((int) $member['id'], null, emailed: true),
            'language' => (string) $member['language'],
            'band' => (string) $this->database->fetchOne('SELECT name FROM band WHERE id = 1'),
        ];
    }
}
