<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\AfterResponse;
use BrassBand\Http\ApiError;
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
        $link = $this->database->transactional(fn () => $this->createLink($email));
        if ($link !== null) {
            $mailer = $this->mailer;
            AfterResponse::add(static function () use ($mailer, $email, $link): void {
                $text = Emails::text('passwordLink', $link['language'], [
                    'band' => $link['band'],
                    'link' => $mailer->url('/password#' . $link['token']),
                ]);
                $mailer->send($email, $link['band'], $text['subject'], $text['body']);
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
     * @return array{token: string, language: string, band: string}|null Null: no email is to be sent
     */
    private function createLink(string $email): ?array
    {
        // The row of the member is held, so that two requests at the same
        // instant send one email.
        $member = $this->database->fetchAssociative(
            'SELECT id, language FROM member WHERE email = ? AND status IN (?, ?) FOR UPDATE',
            [$email, ...AccessRules::SIGN_IN_STATUSES],
        );
        if ($member === false || $this->links->wasEmailedRecently((int) $member['id'])) {
            return null;
        }

        return [
            'token' => $this->links->create((int) $member['id'], null, emailed: true),
            'language' => (string) $member['language'],
            'band' => (string) $this->database->fetchOne('SELECT name FROM band WHERE id = 1'),
        ];
    }
}
