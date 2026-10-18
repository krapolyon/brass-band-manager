<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\ApiError;
use BrassBand\Mail\Mailer;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\TableNotFoundException;

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
        try {
            // SELECT *: the sign-in screen reads this before the migrations
            // are applied, when a column of a later version is not there yet.
            $band = $this->database->fetchAssociative('SELECT * FROM band WHERE id = 1');
        } catch (TableNotFoundException) {
            // An empty database: the install creates its tables.
            $band = false;
        }
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
            // Whether the band talks on Discord: the forms of songs and gigs
            // then take the link of a channel. Not the server itself.
            'hasDiscord' => is_string($band['discordServerId'] ?? null) && $band['discordServerId'] !== '',
            ...$this->logos->urls(),
        ];
    }

    /**
     * The reminders of gigs (null for a reminder that is not sent) and the
     * time between two songs of a setlist.
     *
     * @return array<string, int|null>
     */
    public function gigReminders(): array
    {
        $band = $this->database->fetchAssociative(
            'SELECT gigFirstReminderDays, gigSecondReminderDays, gigReminderHour, setlistGapSeconds FROM band WHERE id = 1',
        );
        if ($band === false) {
            throw new ApiError(404, 'notInstalled');
        }

        return [
            'gigFirstReminderDays' => $band['gigFirstReminderDays'] === null ? null : (int) $band['gigFirstReminderDays'],
            'gigSecondReminderDays' => $band['gigSecondReminderDays'] === null ? null : (int) $band['gigSecondReminderDays'],
            'gigReminderHour' => (int) $band['gigReminderHour'],
            'setlistGapSeconds' => (int) $band['setlistGapSeconds'],
        ];
    }
}
