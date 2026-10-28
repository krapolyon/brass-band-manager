<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Mail\AccountEmails;
use BrassBand\Mail\EmailBand;
use BrassBand\Mail\Mailer;
use Doctrine\DBAL\Connection;

// The invitation of a new member leaves by email (0.4.0, issue #50;
// model/members.md, "An invitation leaves by email"): with a mail server,
// the link created for an invited member is sent by the app to the address
// of their record, in the language of the band, with the name of the band,
// the nickname of the member and the link, nothing else. Without a mail
// server, whoever invites sends the link himself, as before.
//
// The email leaves after the answer, like every email of the app: the host
// sends 100 per hour at most, and an import that invites a band must not
// wait for the mail server. A failure is logged by its kind only, and never
// undoes what was saved: the link is still shown once to whoever invited.
final class Invitations
{
    public function __construct(
        private readonly Connection $database,
        private readonly Mailer $mailer,
        private readonly PersonalData $personal,
    ) {
    }

    public function canSend(): bool
    {
        return $this->mailer->canSend();
    }

    /**
     * Sends their invitation to some members, once the answer has left.
     *
     * @param array<int, string> $tokens The token of the link of each member, by id
     */
    public function sendLater(array $tokens): void
    {
        if ($tokens === [] || !$this->mailer->canSend()) {
            return;
        }
        $band = EmailBand::of($this->database, $this->mailer);
        $language = (string) $this->database->fetchOne('SELECT defaultLanguage FROM band WHERE id = 1');
        $messages = [];
        foreach ($tokens as $memberId => $token) {
            $member = $this->database->fetchAssociative('SELECT id, nickname, email FROM member WHERE id = ?', [$memberId]);
            if ($member === false) {
                continue;
            }
            $member = $this->personal->opened($member);
            $messages[] = [
                'to' => (string) $member['email'],
                'message' => AccountEmails::invitation($band, $language, (string) $member['nickname'], $this->mailer->url('/invitation#' . $token)),
            ];
        }

        $this->mailer->sendLater($band->name, $messages, 'invitation');
    }
}
