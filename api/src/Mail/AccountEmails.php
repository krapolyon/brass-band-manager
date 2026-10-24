<?php

declare(strict_types=1);

namespace BrassBand\Mail;

// The two emails about an account (Figma, page Emails): the link of a
// forgotten password, and the invitation of a new member (issue #50). Each
// holds the name of the band and the link; the invitation also the nickname
// of the member (model/members.md, "An invitation leaves by email"), nothing
// else about them.
final class AccountEmails
{
    /** @return array{subject: string, html: string, text: string} */
    public static function passwordLink(EmailBand $band, string $language, string $link): array
    {
        $values = ['band' => $band->name];

        return EmailLayout::render($band, $language, [
            'subject' => Emails::text('passwordLink.subject', $language, $values),
            'title' => Emails::text('passwordLink.title', $language, $values),
            'paragraphs' => [Emails::text('passwordLink.lead', $language, $values)],
            'button' => ['label' => Emails::text('passwordLink.button', $language, $values), 'url' => $link],
            'after' => [Emails::text('passwordLink.after', $language, $values)],
            'reason' => Emails::text('passwordLink.reason', $language, $values),
        ]);
    }

    /** @return array{subject: string, html: string, text: string} */
    public static function invitation(EmailBand $band, string $language, string $nickname, string $link): array
    {
        $values = ['band' => $band->name, 'nickname' => $nickname];

        return EmailLayout::render($band, $language, [
            'subject' => Emails::text('invitation.subject', $language, $values),
            'title' => Emails::text('invitation.title', $language, $values),
            'paragraphs' => [
                Emails::text('invitation.lead', $language, $values),
                Emails::text('invitation.lead2', $language, $values),
            ],
            'button' => ['label' => Emails::text('invitation.button', $language, $values), 'url' => $link],
            'after' => [Emails::text('invitation.after', $language, $values)],
        ]);
    }
}
