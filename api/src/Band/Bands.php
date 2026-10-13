<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\ApiError;
use BrassBand\Mail\Mailer;
use Doctrine\DBAL\Connection;

// The band as the API shows it. Everything here is public: it is what a
// screen needs before sign-in (model/band.md, "Rules").
final class Bands
{
    public function __construct(
        private readonly Connection $database,
        private readonly LogoStore $logos,
        private readonly Mailer $mailer,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function view(): array
    {
        $band = $this->database->fetchAssociative(
            'SELECT name, defaultLanguage, defaultAccentTheme, defaultCountryCode FROM band WHERE id = 1',
        );
        if ($band === false) {
            throw new ApiError(404, 'notInstalled');
        }

        return [
            'name' => $band['name'],
            'defaultLanguage' => $band['defaultLanguage'],
            'defaultAccentTheme' => $band['defaultAccentTheme'],
            'defaultCountryCode' => $band['defaultCountryCode'],
            // Decides what the forgotten password screen offers.
            'canSendEmail' => $this->mailer->canSend(),
            ...($this->logos->urls() ?? ['logoUrl' => null, 'icons' => null]),
        ];
    }

    /**
     * The reminders of gigs: null for a reminder that is not sent.
     *
     * @return array<string, int|null>
     */
    public function gigReminders(): array
    {
        $band = $this->database->fetchAssociative(
            'SELECT gigFirstReminderDays, gigSecondReminderDays, gigReminderHour FROM band WHERE id = 1',
        );
        if ($band === false) {
            throw new ApiError(404, 'notInstalled');
        }

        return [
            'gigFirstReminderDays' => $band['gigFirstReminderDays'] === null ? null : (int) $band['gigFirstReminderDays'],
            'gigSecondReminderDays' => $band['gigSecondReminderDays'] === null ? null : (int) $band['gigSecondReminderDays'],
            'gigReminderHour' => (int) $band['gigReminderHour'],
        ];
    }
}
