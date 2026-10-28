<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Members\PersonalData;
use BrassBand\Storage\Files;
use Doctrine\DBAL\Connection;

// The export of an installation, format 1 (model/export-import.md): a zip
// with manifest.json and one folder per part, its rows in data.json and its
// files beside them. Rows are written with their business keys, never their
// ids; a reference is the key of what it names (an email, a name).
//
// Never exported: sessions, password links, push subscriptions, and what
// belongs to each member's account (appearance, accessibility, notification
// settings, calendar address). The live state of a setlist is written empty.
// Passwords travel as their hashes. The encrypted fields of a member are
// written in clear: the zip is protected by the password asked before an
// export, and the import encrypts them with the key of its server.
final class Exporter
{
    public const FORMAT = 1;
    public const PARTS = ['settings', 'members', 'songs', 'gigs'];

    /** @var array<string, string> Path in the zip => SHA-256 */
    private array $hashes = [];
    private \ZipArchive $zip;

    public function __construct(
        private readonly Connection $database,
        private readonly PersonalData $personal,
        private readonly Files $files,
    ) {
        $this->zip = new \ZipArchive();
    }

    /**
     * The name of the zip: the band in lowercase letters and hyphens, then
     * the day and the time of the export.
     */
    public function fileName(): string
    {
        $band = (string) $this->database->fetchOne('SELECT name FROM band WHERE id = 1');

        return (self::slug($band) ?: 'export') . '-' . date('Y-m-d-Hi') . '.zip';
    }

    /**
     * Writes the export of some parts to a file.
     *
     * @param list<string> $parts Among PARTS
     */
    public function write(string $file, array $parts, string $exportedBy, string $appVersion): void
    {
        if ($this->zip->open($file, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('The export cannot be written');
        }
        $counts = [];
        foreach (self::PARTS as $part) {
            if (!in_array($part, $parts, true)) {
                continue;
            }
            $data = match ($part) {
                'settings' => $this->settings(),
                'members' => $this->members(),
                'songs' => $this->songs(),
                'gigs' => $this->gigs(),
            };
            foreach (['member', 'song', 'gig'] as $table) {
                if (isset($data[$table])) {
                    $counts[$table] = count($data[$table]);
                }
            }
            $this->zip->addFromString("{$part}/data.json", self::json($data));
        }
        $this->zip->addFromString('manifest.json', self::json([
            'format' => self::FORMAT,
            'app' => 'brass-band-manager',
            'appVersion' => $appVersion,
            'exportedAt' => date('c'),
            'exportedBy' => $exportedBy,
            'parts' => array_values(array_filter(self::PARTS, fn (string $part) => in_array($part, $parts, true))),
            'counts' => (object) $counts,
            'files' => (object) $this->hashes,
        ]));
        if ($this->zip->close() !== true) {
            throw new \RuntimeException('The export cannot be written');
        }
    }

    /** @return array<string, mixed> */
    private function settings(): array
    {
        $band = (array) $this->database->fetchAssociative('SELECT * FROM band WHERE id = 1');

        return [
            'band' => [[
                'name' => $band['name'],
                'defaultLanguage' => $band['defaultLanguage'],
                'defaultAccentTheme' => $band['defaultAccentTheme'],
                'defaultCountryCode' => $band['defaultCountryCode'],
                'gigFirstReminderDays' => self::intOrNull($band['gigFirstReminderDays'] ?? null),
                'gigSecondReminderDays' => self::intOrNull($band['gigSecondReminderDays'] ?? null),
                'gigReminderHour' => (int) $band['gigReminderHour'],
                'discordServerId' => $band['discordServerId'] ?? null,
                'setlistTargetMinutes' => (int) ($band['setlistTargetMinutes'] ?? 45),
                'setlistGapSeconds' => (int) ($band['setlistGapSeconds'] ?? 30),
                // The logo and the icon of the app, with the icons drawn from them.
                'logo' => $this->folder('settings', 'logo', $band['logoPath'] ?? null),
                'appIcon' => $this->folder('settings', 'appIcon', $band['iconPath'] ?? null),
            ]],
            'section' => array_map(fn (array $row) => [
                'name' => $row['name'],
                'position' => (int) $row['position'],
                'icon' => $row['icon'],
                'discordRoleId' => $row['discordRoleId'],
            ], $this->database->fetchAllAssociative('SELECT * FROM section ORDER BY position')),
            'instrument' => array_map(fn (array $row) => [
                'name' => $row['name'],
                'section' => $row['section'],
                'position' => (int) $row['position'],
            ], $this->database->fetchAllAssociative('SELECT i.name, s.name AS section, i.position FROM instrument i JOIN section s ON s.id = i.sectionId ORDER BY s.position, i.position')),
            'instrumentAlias' => $this->database->fetchAllAssociative('SELECT a.alias, i.name AS instrument FROM instrumentAlias a JOIN instrument i ON i.id = a.instrumentId ORDER BY a.alias'),
        ];
    }

    /** @return array<string, mixed> */
    private function members(): array
    {
        $rows = [];
        $names = [];
        foreach ($this->database->fetchAllAssociative(
            'SELECT m.id, m.nickname, m.firstName, m.lastName, m.email, m.mobilePhone, m.streetAddress, m.postalCode, m.city,
                    m.countryCode, m.addressInstructions, m.photoPath, i.name AS instrument, m.passwordHash, m.status, m.language
             FROM member m JOIN instrument i ON i.id = m.instrumentId ORDER BY m.nickname',
        ) as $row) {
            $row = $this->personal->opened($row);
            $photo = null;
            if (is_string($row['photoPath']) && ($source = $this->files->find($row['photoPath'])) !== null) {
                $base = self::slug((string) $row['nickname']) ?: 'member';
                $names[$base] = ($names[$base] ?? 0) + 1;
                $photo = "files/{$base}-{$names[$base]}." . pathinfo($source, PATHINFO_EXTENSION);
                $this->add('members', $photo, $source);
            }
            $rows[] = [
                'email' => $row['email'],
                'nickname' => $row['nickname'],
                'firstName' => $row['firstName'],
                'lastName' => $row['lastName'],
                'instrument' => $row['instrument'],
                'status' => $row['status'],
                'roles' => $this->database->fetchFirstColumn('SELECT role FROM memberRole WHERE memberId = ? ORDER BY role', [$row['id']]),
                'passwordHash' => $row['passwordHash'],
                'language' => $row['language'],
                'mobilePhone' => $row['mobilePhone'],
                'streetAddress' => $row['streetAddress'],
                'postalCode' => $row['postalCode'],
                'city' => $row['city'],
                'countryCode' => $row['countryCode'],
                'addressInstructions' => $row['addressInstructions'],
                'photo' => $photo,
            ];
        }

        return ['member' => $rows];
    }

    /** @return array<string, mixed> */
    private function songs(): array
    {
        $rows = [];
        // Two names can give the same folder ("Ça va" and "Ça va !"): a number tells them apart.
        $folders = [];
        $emails = $this->personal->emailsById();
        foreach ($this->database->fetchAllAssociative('SELECT * FROM song ORDER BY name') as $song) {
            $id = (int) $song['id'];
            $folder = self::slug((string) $song['name']) ?: "song-{$id}";
            $folder = self::unused($folders, $folder);
            $file = function (mixed $path, string $name) use ($folder): ?string {
                $source = is_string($path) ? $this->files->find($path) : null;
                if ($source === null) {
                    return null;
                }
                $inZip = "files/{$folder}/{$name}." . pathinfo($source, PATHINFO_EXTENSION);
                $this->add('songs', $inZip, $source);

                return $inZip;
            };
            $audio = $file($song['audioPath'], 'audio');
            $peaks = null;
            if ($audio !== null && ($source = $this->files->find((string) $song['audioPath'])) !== null && is_file(dirname($source) . '/peaks.json')) {
                $peaks = "files/{$folder}/peaks.json";
                $this->add('songs', $peaks, dirname($source) . '/peaks.json');
            }
            $parts = [];
            foreach ($this->database->fetchAllAssociative('SELECT i.name AS instrument, p.pdfPath FROM songPart p JOIN instrument i ON i.id = p.instrumentId WHERE p.songId = ? ORDER BY i.name', [$id]) as $index => $part) {
                $pdf = $file($part['pdfPath'], 'part-' . ($index + 1));
                if ($pdf !== null) {
                    $parts[] = ['instrument' => $part['instrument'], 'pdf' => $pdf];
                }
            }
            $levels = [];
            foreach ($this->database->fetchAllAssociative('SELECT memberId, masteryLevel, enjoymentLevel, ratedOn FROM memberSong WHERE songId = ?', [$id]) as $level) {
                $levels[] = ['memberEmail' => $emails[(int) $level['memberId']] ?? null, 'masteryLevel' => self::intOrNull($level['masteryLevel']), 'enjoymentLevel' => self::intOrNull($level['enjoymentLevel']), 'ratedOn' => $level['ratedOn']];
            }
            $sections = fn (string $table) => $this->database->fetchFirstColumn("SELECT s.name FROM {$table} t JOIN section s ON s.id = t.sectionId WHERE t.songId = ? ORDER BY s.position", [$id]);
            $rows[] = [
                'name' => $song['name'],
                'originalTitle' => $song['originalTitle'],
                'originalArtist' => $song['originalArtist'],
                'copyright' => $song['copyright'],
                'bpm' => self::intOrNull($song['bpm']),
                'status' => $song['status'],
                'versionOn' => $song['versionOn'],
                'versionNote' => $song['versionNote'],
                'clipUrl' => $song['clipUrl'],
                'discordChannelId' => $song['discordChannelId'],
                'durationSeconds' => self::intOrNull($song['durationSeconds']),
                'inRepertoireOn' => $song['inRepertoireOn'],
                'mood' => $song['mood'],
                'positions' => $this->database->fetchFirstColumn("SELECT position FROM songPosition WHERE songId = ? ORDER BY FIELD(position, 'START', 'FIRST_HALF', 'MIDDLE', 'SECOND_HALF', 'END')", [$id]),
                'tiringFor' => $sections('songTiringSection'),
                'trickyFor' => $sections('songTrickySection'),
                'spokenNames' => $this->database->fetchFirstColumn('SELECT phrase FROM songSpokenName WHERE songId = ? ORDER BY createdAt, id', [$id]),
                'cover' => $file($song['coverPath'], 'cover'),
                'museScore' => $file($song['museScorePath'], 'score'),
                'midi' => $file($song['midiPath'], 'midi'),
                'musicXml' => $file($song['musicXmlPath'], 'musicxml'),
                'audio' => $audio,
                'peaks' => $peaks,
                'clipThumbnail' => $file($song['clipThumbnailPath'], 'clip'),
                'parts' => $parts,
                'levels' => $levels,
            ];
        }

        return ['song' => $rows];
    }

    /** @return array<string, mixed> */
    private function gigs(): array
    {
        $costumes = [];
        $pictures = [];
        foreach ($this->database->fetchAllAssociative('SELECT * FROM costume ORDER BY position') as $costume) {
            $source = is_string($costume['imagePath']) ? $this->files->find($costume['imagePath']) : null;
            $picture = null;
            if ($source !== null) {
                $base = self::slug((string) $costume['name']) ?: "costume-{$costume['id']}";
                $base = self::unused($pictures, $base);
                $picture = "files/{$base}." . pathinfo($source, PATHINFO_EXTENSION);
                $this->add('gigs', $picture, $source);
            }
            $costumes[] = ['name' => $costume['name'], 'position' => (int) $costume['position'], 'picture' => $picture];
        }
        $emails = $this->personal->emailsById();

        $rows = [];
        foreach ($this->database->fetchAllAssociative('SELECT * FROM gig ORDER BY startsOn, name') as $gig) {
            $id = (int) $gig['id'];
            $slots = [];
            $positions = [];
            foreach ($this->database->fetchAllAssociative('SELECT s.id, s.position, s.name, s.note, c.name AS costume FROM gigSlot s LEFT JOIN costume c ON c.id = s.costumeId WHERE s.gigId = ? ORDER BY s.position', [$id]) as $slot) {
                $positions[(int) $slot['id']] = (int) $slot['position'];
                $slots[] = [
                    'position' => (int) $slot['position'],
                    'name' => $slot['name'],
                    'note' => $slot['note'],
                    'costume' => $slot['costume'],
                    'answers' => array_map(fn (array $answer) => ['memberEmail' => $emails[(int) $answer['memberId']], 'answer' => $answer['answer']], $this->database->fetchAllAssociative('SELECT memberId, answer FROM gigSlotAttendance WHERE gigSlotId = ?', [$slot['id']])),
                ];
            }
            $setlists = [];
            foreach ($this->database->fetchAllAssociative('SELECT id, gigSlotId, number, description FROM setlist WHERE gigId = ? ORDER BY number', [$id]) as $setlist) {
                $setlists[] = [
                    'number' => (int) $setlist['number'],
                    'slotPosition' => $positions[(int) $setlist['gigSlotId']] ?? 1,
                    'description' => $setlist['description'],
                    'songs' => $this->database->fetchFirstColumn('SELECT s.name FROM setlistSong ss JOIN song s ON s.id = ss.songId WHERE ss.setlistId = ? ORDER BY ss.position', [$setlist['id']]),
                ];
            }
            $rows[] = [
                'name' => $gig['name'],
                'status' => $gig['status'],
                'startsOn' => $gig['startsOn'],
                'endsOn' => $gig['endsOn'],
                'meetingTime' => $gig['meetingTime'] === null ? null : substr((string) $gig['meetingTime'], 0, 5),
                'placeName' => $gig['placeName'],
                'placeUrl' => $gig['placeUrl'],
                'streetAddress' => $gig['streetAddress'],
                'postalCode' => $gig['postalCode'],
                'city' => $gig['city'],
                'latitude' => $gig['latitude'] === null ? null : (float) $gig['latitude'],
                'longitude' => $gig['longitude'] === null ? null : (float) $gig['longitude'],
                'notes' => $gig['notes'],
                'discordChannelId' => $gig['discordChannelId'],
                'proposedAt' => self::instant($gig['proposedAt']),
                'remindedAt' => self::instant($gig['remindedAt']),
                'organizers' => array_map(fn ($memberId) => $emails[(int) $memberId], $this->database->fetchFirstColumn('SELECT memberId FROM gigOrganizer WHERE gigId = ?', [$id])),
                'costumes' => $this->database->fetchFirstColumn('SELECT c.name FROM gigCostume gc JOIN costume c ON c.id = gc.costumeId WHERE gc.gigId = ? ORDER BY c.position', [$id]),
                'slots' => $slots,
                'setlists' => $setlists,
            ];
        }

        return ['costume' => $costumes, 'gig' => $rows];
    }

    // Every file of the folder of a logo or of the icon of the app.
    private function folder(string $part, string $name, mixed $path): ?string
    {
        $source = is_string($path) ? $this->files->find($path) : null;
        if ($source === null) {
            return null;
        }
        $main = null;
        foreach (glob(dirname($source) . '/*') ?: [] as $file) {
            $inZip = "files/{$name}/" . basename($file);
            $this->add($part, $inZip, $file);
            if ($file === $source) {
                $main = $inZip;
            }
        }

        return $main;
    }

    private function add(string $part, string $inZip, string $source): void
    {
        $this->zip->addFile($source, "{$part}/{$inZip}");
        // Kept as they are: images, recordings and archives are compressed already.
        $this->zip->setCompressionName("{$part}/{$inZip}", \ZipArchive::CM_STORE);
        $this->hashes["{$part}/{$inZip}"] = 'sha256:' . hash_file('sha256', $source);
    }

    private static function instant(mixed $utc): ?string
    {
        return is_string($utc) ? str_replace(' ', 'T', $utc) . '+00:00' : null;
    }

    private static function intOrNull(mixed $value): ?int
    {
        return $value === null ? null : (int) $value;
    }

    /** "Les Krapos" → "les-krapos": letters, digits and hyphens. */
    /**
     * A name not yet taken among $used, then taken: "ca-va", then "ca-va-2".
     *
     * @param array<string, true> $used
     */
    private static function unused(array &$used, string $name): string
    {
        $unused = $name;
        for ($number = 2; isset($used[$unused]); $number++) {
            $unused = "{$name}-{$number}";
        }
        $used[$unused] = true;

        return $unused;
    }

    public static function slug(string $text): string
    {
        return implode('-', \BrassBand\Songs\FileNames::words($text));
    }

    private static function json(mixed $data): string
    {
        return json_encode($data, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    }
}
