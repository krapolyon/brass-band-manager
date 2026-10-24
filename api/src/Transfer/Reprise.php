<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Access\Role;
use BrassBand\Gigs\GigInput;
use BrassBand\Gigs\GigRecord;
use BrassBand\Gigs\Gigs;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Install\Languages;
use BrassBand\Members\MemberInput;
use BrassBand\Members\MemberRecord;
use BrassBand\Members\PersonalData;
use BrassBand\Members\PhotoInput;
use BrassBand\Members\PhotoStore;
use BrassBand\Songs\FileNames;
use BrassBand\Songs\SetPosition;
use BrassBand\Songs\SongFiles;
use BrassBand\Songs\SongInput;
use BrassBand\Songs\SongMood;
use BrassBand\Songs\SongRecord;
use BrassBand\Songs\SongStatus;
use BrassBand\Songs\SpokenNames;
use Doctrine\DBAL\Connection;

// Reads a "zip de reprise" (model/export-import.md, part "Reprise", issue
// #43): the members, songs, gigs, slots and answers a band kept in
// spreadsheets, with the photos of members and the files of songs. Checks
// every row by the same rules as the screens of the app (MemberRecord,
// SongRecord, GigRecord, and the checks of an upload for each file), and
// gives either every problem, with its file and line, or the plan of what a
// load writes (Loader). Nothing is written here.
//
// A row whose key exists in the installation updates it (a member by email,
// a song by name, a gig by name and first day); otherwise it is added. An
// empty cell of an optional column leaves an existing value as it is.
final class Reprise
{
    // The columns of each file, the required ones first (model/export-import.md).
    public const FILES = [
        'members' => ['email', 'nickname', 'firstName', 'lastName', 'instrument', 'status', 'roles', 'mobilePhone', 'streetAddress', 'postalCode', 'city', 'countryCode', 'addressInstructions', 'language', 'photo'],
        'songs' => ['name', 'originalTitle', 'originalArtist', 'status', 'inRepertoireOn', 'mood', 'positions', 'tiringFor', 'trickyFor', 'bpm', 'durationSeconds', 'versionOn', 'versionNote', 'copyright', 'clipUrl', 'discordChannel', 'spokenNames'],
        'gigs' => ['name', 'startsOn', 'endsOn', 'status', 'meetingTime', 'placeName', 'placeUrl', 'streetAddress', 'postalCode', 'city', 'latitude', 'longitude', 'notes', 'discordChannel', 'organizers', 'costumes'],
        'slots' => ['gigName', 'gigStartsOn', 'position', 'name', 'note', 'costume'],
        'answers' => ['gigName', 'gigStartsOn', 'slotPosition', 'memberEmail', 'answer'],
    ];
    public const REQUIRED = [
        'members' => ['email', 'nickname', 'firstName', 'lastName', 'instrument'],
        'songs' => ['name', 'originalTitle', 'originalArtist'],
        'gigs' => ['name', 'startsOn'],
        'slots' => ['gigName', 'gigStartsOn', 'position'],
        'answers' => ['gigName', 'gigStartsOn', 'memberEmail', 'answer'],
    ];
    // What the screen offers to tick, and the files each one loads.
    public const PARTS = ['members' => ['members'], 'songs' => ['songs'], 'gigs' => ['gigs', 'slots'], 'answers' => ['answers']];

    private readonly Problems $problems;
    private readonly string $language;
    /** @var array<string, int> Instrument names and known spellings, plain => id */
    private array $instruments = [];
    /** @var array<string, int> Section names, plain => id */
    private array $sections = [];
    /** @var array<string, int> Costume names, plain => id */
    private array $costumes = [];
    /** @var array<string, int> Members of the installation, email => id */
    private array $knownMembers = [];
    /** @var array<string, true> Members of members.csv that will exist, by email */
    private array $fileMembers = [];
    /** @var array<string, array{id: int|null, costumeIds: list<int>, slots: array<int, int>}> Gigs, by "name|startsOn" plain */
    private array $gigs = [];

    /**
     * @param list<string> $parts The parts to load: keys of PARTS
     * @param int|null $importerId The admin who loads: keeps ADMIN, never invited
     */
    public function __construct(
        private readonly Connection $database,
        private readonly PersonalData $personal,
        private readonly \ZipArchive $zip,
        private readonly array $parts,
        private readonly ?int $importerId,
    ) {
        $this->problems = new Problems();
        $this->language = (string) ($database->fetchOne('SELECT defaultLanguage FROM band WHERE id = 1') ?: Languages::DEFAULT);
    }

    /** Whether a zip is a reprise: it holds one of the CSV files at its root. */
    public static function isReprise(\ZipArchive $zip): bool
    {
        foreach (array_keys(self::FILES) as $file) {
            if ($zip->locateName("{$file}.csv") !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * Reads the zip: every problem, or the plan of what to write and what it
     * counts for the screen.
     *
     * @return array{problems: Problems, plan: array<string, mixed>, summary: array<string, mixed>}
     */
    public function read(): array
    {
        $this->loadLists();
        $plan = ['members' => [], 'songs' => [], 'gigs' => [], 'answers' => [], 'invitations' => 0];
        $summary = ['kind' => 'reprise', 'files' => [], 'fileCount' => 0];

        $csv = [];
        foreach (array_keys(self::FILES) as $file) {
            $content = $this->zip->getFromName("{$file}.csv");
            if ($content === false) {
                continue;
            }
            $summary['files'][] = $file;
            $read = Csv::read($content);
            if ($read === null) {
                $this->problems->add("{$file}.csv", null, null, 'notUtf8');
                continue;
            }
            $this->checkHeader($file, $read['header']);
            $csv[$file] = $read['rows'];
        }
        $summary['fileCount'] = $this->countFiles();

        // In the order a load writes them: what a row refers to is read first.
        $loads = fn (string $part) => in_array($part, $this->parts, true);
        if ($loads('members') && isset($csv['members'])) {
            [$plan['members'], $summary['members']] = $this->members($csv['members']);
            $plan['invitations'] = count(array_filter($plan['members'], fn (array $member) => $member['invite']));
        }
        if ($loads('songs') && isset($csv['songs'])) {
            [$plan['songs'], $summary['songs']] = $this->songs($csv['songs']);
        }
        if ($loads('gigs') && isset($csv['gigs'])) {
            [$plan['gigs'], $summary['gigs']] = $this->gigs($csv['gigs'], $csv['slots'] ?? []);
        } elseif ($loads('gigs') && isset($csv['slots'])) {
            [$plan['gigs'], $summary['gigs']] = $this->gigs([], $csv['slots']);
        }
        if ($loads('answers') && isset($csv['answers'])) {
            [$plan['answers'], $summary['answers']] = $this->answers($csv['answers']);
        }
        $summary['invitations'] = $plan['invitations'];

        return ['problems' => $this->problems, 'plan' => $plan, 'summary' => $summary];
    }

    /** @param list<string> $header */
    private function checkHeader(string $file, array $header): void
    {
        foreach ($header as $column) {
            if (!in_array($column, self::FILES[$file], true)) {
                $this->problems->add("{$file}.csv", 1, $column, 'unknownColumn', $column);
            }
        }
        foreach (self::REQUIRED[$file] as $column) {
            if (!in_array($column, $header, true)) {
                $this->problems->add("{$file}.csv", 1, $column, 'missingColumn', $column);
            }
        }
    }

    private function loadLists(): void
    {
        foreach ($this->database->fetchAllAssociative('SELECT id, name FROM instrument') as $row) {
            $this->instruments[Values::plain((string) $row['name'])] = (int) $row['id'];
        }
        foreach ($this->database->fetchAllAssociative('SELECT instrumentId, alias FROM instrumentAlias') as $row) {
            $this->instruments[Values::plain((string) $row['alias'])] ??= (int) $row['instrumentId'];
        }
        foreach ($this->database->fetchAllAssociative('SELECT id, name FROM section') as $row) {
            $this->sections[Values::plain((string) $row['name'])] = (int) $row['id'];
        }
        foreach ($this->database->fetchAllAssociative('SELECT id, name FROM costume') as $row) {
            $this->costumes[Values::plain((string) $row['name'])] = (int) $row['id'];
        }
        foreach ($this->database->fetchAllAssociative('SELECT id, email FROM member') as $row) {
            $this->knownMembers[(string) $this->personal->opened($row)['email']] = (int) $row['id'];
        }
    }

    private function countFiles(): int
    {
        $count = 0;
        for ($index = 0; $index < $this->zip->numFiles; $index++) {
            $name = (string) $this->zip->getNameIndex($index);
            if ((str_starts_with($name, 'members/photos/') || str_starts_with($name, 'songs/')) && !str_ends_with($name, '/')) {
                $count++;
            }
        }

        return $count;
    }

    // ------------------------------------------------------------------
    // members.csv
    // ------------------------------------------------------------------

    /**
     * @param list<array{line: int, cells: array<string, string>}> $rows
     * @return array{list<array<string, mixed>>, array<string, int>}
     */
    private function members(array $rows): array
    {
        $plan = [];
        $nicknames = [];
        $count = ['total' => 0, 'new' => 0, 'updated' => 0, 'photos' => 0];
        foreach ($rows as ['line' => $line, 'cells' => $cells]) {
            $at = fn (string $column, string $error, ?string $value = null) => $this->problems->add('members.csv', $line, $column, $error, $value);
            $email = mb_strtolower(trim($cells['email'] ?? ''));
            if ($email === '') {
                $at('email', 'required');
                continue;
            }
            if (isset($this->fileMembers[$email])) {
                $at('email', 'twice', $email);
                continue;
            }
            $this->fileMembers[$email] = true;
            $count['total']++;

            $id = $this->knownMembers[$email] ?? null;
            $row = $id === null ? false : $this->database->fetchAssociative(
                'SELECT nickname, firstName, lastName, email, mobilePhone, streetAddress, postalCode, city, countryCode, addressInstructions, instrumentId, status, passwordHash IS NOT NULL AS hasPassword, language FROM member WHERE id = ?',
                [$id],
            );
            $current = $row === false ? null : $this->personal->opened($row);
            $cell = fn (string $column) => trim($cells[$column] ?? '');
            $kept = fn (string $column) => $cell($column) !== '' ? $cell($column) : (is_scalar($current[$column] ?? null) ? (string) $current[$column] : null);

            $instrumentId = is_int($current['instrumentId'] ?? null) || is_string($current['instrumentId'] ?? null) ? (int) $current['instrumentId'] : 0;
            if ($cell('instrument') !== '') {
                $instrumentId = $this->instruments[Values::plain($cell('instrument'))] ?? 0;
                if ($instrumentId === 0) {
                    $at('instrument', 'unknownInstrument', $cell('instrument'));
                }
            }
            $phone = $kept('mobilePhone');
            if ($cell('mobilePhone') !== '' && !str_starts_with(preg_replace('/[\s.\-]+/u', '', $cell('mobilePhone')) ?? '', '+')) {
                // Decided with the owner: the country of the band is not guessed.
                $at('mobilePhone', 'phoneWithoutPrefix', $cell('mobilePhone'));
                $phone = null;
            }
            $status = null;
            if ($cell('status') !== '') {
                $status = Values::code($cell('status'), Values::list('memberStatus', $this->language));
                if ($status === null) {
                    $at('status', 'unknownValue', $cell('status'));
                }
            }
            $roles = null;
            if ($cell('roles') !== '') {
                $roles = [];
                foreach (Values::several($cell('roles')) as $role) {
                    $code = Values::code($role, Values::list('role', $this->language));
                    $code === null ? $at('roles', 'unknownValue', $role) : $roles[] = $code;
                }
            }
            $language = $cell('language') !== '' ? $cell('language') : ($current['language'] ?? $this->language);
            if (!Languages::isAvailable((string) $language)) {
                $at('language', 'unknownValue', (string) $language);
            }

            // The record, as the form of a member checks it.
            try {
                $values = (new MemberRecord($this->database, $this->personal))->check(new MemberInput(
                    nickname: $kept('nickname') ?? '',
                    firstName: $kept('firstName') ?? '',
                    lastName: $kept('lastName') ?? '',
                    email: $email,
                    instrumentId: $instrumentId,
                    mobilePhone: $phone,
                    streetAddress: $kept('streetAddress'),
                    postalCode: $kept('postalCode'),
                    city: $kept('city'),
                    countryCode: $kept('countryCode'),
                    addressInstructions: $kept('addressInstructions'),
                ), $id);
            } catch (ApiError $refused) {
                foreach ($refused->fields as $field => $error) {
                    if ($field !== 'instrumentId' || $instrumentId !== 0) {
                        $at($field === 'instrumentId' ? 'instrument' : (string) $field, (string) $error, $field === 'instrumentId' ? $cell('instrument') : ($kept((string) $field) ?? ''));
                    }
                }
                continue;
            }
            $plain = Values::plain((string) $values['nickname']);
            if (isset($nicknames[$plain])) {
                $at('nickname', 'twice', (string) $values['nickname']);
                continue;
            }
            $nicknames[$plain] = true;

            // A new member is invited, unless they left: kept for the history
            // of answers (decided on 2026-10-24). A member who has a password
            // changes between the three statuses; one who has none stays
            // invited unless they left.
            $hasPassword = (bool) ($current['hasPassword'] ?? false);
            $newStatus = $status === 'LEFT' ? 'LEFT' : ($id === null || !$hasPassword ? 'INVITED' : ($status ?? (string) ($current['status'] ?? 'INVITED')));
            if ($id === $this->importerId) {
                // The admin who loads keeps ADMIN, and stays as they are.
                $roles = $roles === null ? null : array_values(array_unique([...$roles, Role::ADMIN->value]));
                $newStatus = (string) ($current['status'] ?? 'ACTIVE');
            }

            $photo = $this->photo($line, $cell('photo'), (string) $values['nickname']);
            if ($newStatus === 'LEFT') {
                // What served only while they played is not kept (Members, "Leaving").
                $values = [...$values, 'mobilePhone' => null, 'streetAddress' => null, 'postalCode' => null, 'city' => null, 'countryCode' => null, 'addressInstructions' => null];
                $roles = [];
                $photo = null;
            }
            $count[$id === null ? 'new' : 'updated']++;
            $count['photos'] += $photo === null ? 0 : 1;
            $plan[] = [
                'id' => $id,
                'email' => $email,
                'values' => [...$values, 'language' => $language, 'status' => $newStatus],
                'roles' => $roles,
                'photo' => $photo,
                'invite' => $newStatus === 'INVITED' && $id !== $this->importerId,
            ];
        }

        return [$plan, $count];
    }

    /**
     * The photo of a member, checked as an upload. Empty cell: the file named
     * after the nickname, when there is one.
     *
     * @return array{extension: string, image: string}|null
     */
    private function photo(int $line, string $cell, string $nickname): ?array
    {
        $name = null;
        if ($cell !== '') {
            $name = "members/photos/{$cell}";
            if ($this->zip->locateName($name) === false) {
                $this->problems->add('members.csv', $line, 'photo', 'unknownFile', $cell);

                return null;
            }
        } else {
            foreach (['jpg', 'jpeg', 'png', 'webp'] as $extension) {
                if ($this->zip->locateName("members/photos/{$nickname}.{$extension}", \ZipArchive::FL_NOCASE) !== false) {
                    $name = (string) $this->zip->getNameIndex((int) $this->zip->locateName("members/photos/{$nickname}.{$extension}", \ZipArchive::FL_NOCASE));
                    break;
                }
            }
        }
        if ($name === null) {
            return null;
        }
        $errors = new FieldErrors();
        $photo = (new PhotoStore($this->database, new \BrassBand\Storage\Files(sys_get_temp_dir())))->read($errors, 'photo', new PhotoInput(base64_encode((string) $this->zip->getFromName($name))));
        if ($photo === null) {
            $this->problems->add($name, null, null, 'invalidPhoto');
        }

        return $photo;
    }

    // ------------------------------------------------------------------
    // songs.csv and the folders of songs/
    // ------------------------------------------------------------------

    /**
     * @param list<array{line: int, cells: array<string, string>}> $rows
     * @return array{list<array<string, mixed>>, array<string, int>}
     */
    private function songs(array $rows): array
    {
        $plan = [];
        $names = [];
        $count = ['total' => 0, 'new' => 0, 'updated' => 0, 'files' => 0];
        $folders = $this->songFolders();
        $records = new SongRecord($this->database);
        $year = $this->yearOf('songs.csv');
        foreach ($rows as ['line' => $line, 'cells' => $cells]) {
            $at = fn (string $column, string $error, ?string $value = null) => $this->problems->add('songs.csv', $line, $column, $error, $value);
            $cell = fn (string $column) => trim($cells[$column] ?? '');
            $name = $cell('name');
            if ($name === '') {
                $at('name', 'required');
                continue;
            }
            $plainName = Values::plain($name);
            if (isset($names[$plainName])) {
                $at('name', 'twice', $name);
                continue;
            }
            $names[$plainName] = true;
            $count['total']++;

            // The same song whatever the case and the accents, as in the app.
            $current = $this->database->fetchAssociative('SELECT * FROM song WHERE name = ?', [$name]) ?: null;
            $id = $current === null ? null : (int) $current['id'];
            $kept = fn (string $column, string $field) => $cell($column) !== '' ? $cell($column) : (is_scalar($current[$field] ?? null) ? (string) $current[$field] : null);

            $status = SongStatus::tryFrom((string) ($current['status'] ?? 'PROPOSED')) ?? SongStatus::PROPOSED;
            if ($cell('status') !== '') {
                $code = Values::code($cell('status'), Values::list('songStatus', $this->language));
                $code === null ? $at('status', 'unknownValue', $cell('status')) : $status = SongStatus::from($code);
            }
            $mood = SongMood::tryFrom((string) ($current['mood'] ?? 'MEDIUM')) ?? SongMood::MEDIUM;
            if ($cell('mood') !== '') {
                $code = Values::code($cell('mood'), Values::list('mood', $this->language));
                $code === null ? $at('mood', 'unknownValue', $cell('mood')) : $mood = SongMood::from($code);
            }
            $positions = null;
            if ($cell('positions') !== '') {
                $positions = [];
                foreach (Values::several($cell('positions')) as $position) {
                    $code = Values::code($position, Values::list('position', $this->language));
                    $code === null ? $at('positions', 'unknownValue', $position) : $positions[] = SetPosition::from($code);
                }
            } elseif ($id !== null) {
                $positions = array_map(fn ($value) => SetPosition::from((string) $value), $this->database->fetchFirstColumn('SELECT position FROM songPosition WHERE songId = ?', [$id]));
            }
            $sectionsOf = function (string $column, string $table) use ($cell, $at, $id): array {
                if ($cell($column) === '') {
                    return $id === null ? [] : array_map(intval(...), $this->database->fetchFirstColumn("SELECT sectionId FROM {$table} WHERE songId = ?", [$id]));
                }
                $ids = [];
                foreach (Values::several($cell($column)) as $section) {
                    $sectionId = $this->sections[Values::plain($section)] ?? null;
                    $sectionId === null ? $at($column, 'unknownSection', $section) : $ids[] = $sectionId;
                }

                return $ids;
            };
            $tiring = $sectionsOf('tiringFor', 'songTiringSection');
            $tricky = $sectionsOf('trickyFor', 'songTrickySection');
            $number = function (string $column, callable $read) use ($cell, $at, $current): ?int {
                if ($cell($column) === '') {
                    return is_numeric($current[$column] ?? null) ? (int) $current[$column] : null;
                }
                $value = $read($cell($column));
                if ($value === null) {
                    $at($column, 'invalid', $cell($column));
                }

                return $value;
            };
            $bpm = $number('bpm', Values::integer(...));
            $duration = $number('durationSeconds', Values::seconds(...));
            $day = function (string $column) use ($cell, $at, $current): ?string {
                if ($cell($column) === '') {
                    return is_string($current[$column] ?? null) ? $current[$column] : null;
                }
                $value = Values::day($cell($column));
                if ($value === null) {
                    $at($column, 'invalid', $cell($column));
                }

                return $value;
            };
            $inRepertoireOn = $day('inRepertoireOn');
            // In the repertoire without a day: the 1st of January of the
            // year of the file (Songs domain, "In the repertoire since").
            if ($inRepertoireOn === null && $status === SongStatus::IN_REPERTOIRE) {
                $inRepertoireOn = "{$year}-01-01";
            }

            try {
                $values = $records->check(new SongInput(
                    name: $name,
                    originalTitle: $kept('originalTitle', 'originalTitle') ?? '',
                    originalArtist: $kept('originalArtist', 'originalArtist') ?? '',
                    status: $status,
                    copyright: $kept('copyright', 'copyright'),
                    bpm: $bpm,
                    versionOn: $day('versionOn'),
                    versionNote: $kept('versionNote', 'versionNote'),
                    clipUrl: $kept('clipUrl', 'clipUrl'),
                    discordChannelId: $kept('discordChannel', 'discordChannelId'),
                    durationSeconds: $duration,
                    inRepertoireOn: $inRepertoireOn,
                    mood: $mood,
                    positions: $positions,
                    tiringSectionIds: $tiring,
                    trickySectionIds: $tricky,
                ), $id, $current);
            } catch (ApiError $refused) {
                foreach ($refused->fields as $field => $error) {
                    $column = ['discordChannelId' => 'discordChannel', 'tiringSectionIds' => 'tiringFor', 'trickySectionIds' => 'trickyFor'][$field] ?? (string) $field;
                    $at($column, (string) $error, $cell($column));
                }
                continue;
            }

            $spoken = null;
            if ($cell('spokenNames') !== '') {
                $spoken = [];
                foreach (Values::several($cell('spokenNames')) as $phrase) {
                    $clean = SpokenNames::clean($phrase);
                    strlen($clean) < 3 || strlen($clean) > 60 ? $at('spokenNames', 'invalid', $phrase) : $spoken[] = $clean;
                }
            }

            [$files, $parts] = $this->songFiles($folders[$plainName] ?? []);
            unset($folders[$plainName]);
            $count['files'] += count($files) + count($parts);
            $count[$id === null ? 'new' : 'updated']++;
            $plan[] = [
                'id' => $id,
                'name' => $name,
                'values' => $values,
                'positions' => array_map(fn (SetPosition $position) => $position->value, $positions ?? SetPosition::ofNewSong()),
                'tiring' => array_values(array_unique($tiring)),
                'tricky' => array_values(array_unique($tricky)),
                'spokenNames' => $spoken,
                'files' => $files,
                'parts' => $parts,
            ];
        }
        // A folder of a song that is in no row: its files would go nowhere.
        foreach ($folders as $entries) {
            $this->problems->add(dirname($entries[0]) . '/', null, null, 'unknownSong', basename(dirname($entries[0])));
        }

        return [$plan, $count];
    }

    /**
     * The files of songs/, by the plain name of their folder.
     *
     * @return array<string, list<string>>
     */
    private function songFolders(): array
    {
        $folders = [];
        for ($index = 0; $index < $this->zip->numFiles; $index++) {
            $name = (string) $this->zip->getNameIndex($index);
            if (preg_match('#\Asongs/([^/]+)/([^/]+)\z#', $name, $found) === 1 && !str_starts_with($found[2], '.')) {
                $folders[Values::plain($found[1])][] = $name;
            }
        }

        return $folders;
    }

    /**
     * Each file of the folder of a song, placed and checked as the import
     * of songs in the app does: its kind from its name, the instrument of a
     * part from the known spellings, then its content.
     *
     * @param list<string> $entries
     * @return array{array<string, string>, array<int, string>} Kind => entry, and instrument id => entry of a part
     */
    private function songFiles(array $entries): array
    {
        $files = [];
        $parts = [];
        $placed = (new FileNames($this->database))->place(array_map('basename', $entries));
        foreach ($placed as $index => $place) {
            $entry = $entries[$index];
            if ($place['problem'] !== null || $place['role'] === null) {
                $this->problems->add($entry, null, null, $place['role'] === 'part' ? 'partWithoutInstrument' : 'unknownKind');
                continue;
            }
            $content = (string) $this->zip->getFromName($entry);
            try {
                if (strlen($content) > SongFiles::MAX_BYTES[$place['role']]) {
                    throw new ApiError(413, 'fileTooBig');
                }
                SongFiles::nameOf($place['role'], $content);
            } catch (ApiError $refused) {
                $this->problems->add($entry, null, null, $refused->error === 'fileTooBig' ? 'fileTooBig' : 'invalidFile');
                continue;
            }
            if ($place['role'] === 'part') {
                $parts[(int) $place['instrumentId']] = $entry;
            } else {
                $files[$place['role']] = $entry;
            }
        }

        return [$files, $parts];
    }

    // The year a file of the zip was last written: what "the year of the file" means.
    private function yearOf(string $name): string
    {
        $stat = $this->zip->statName($name);

        return $stat === false ? gmdate('Y') : gmdate('Y', (int) $stat['mtime']);
    }

    // ------------------------------------------------------------------
    // gigs.csv and slots.csv
    // ------------------------------------------------------------------

    /**
     * @param list<array{line: int, cells: array<string, string>}> $rows
     * @param list<array{line: int, cells: array<string, string>}> $slotRows
     * @return array{list<array<string, mixed>>, array<string, int>}
     */
    private function gigs(array $rows, array $slotRows): array
    {
        $plan = [];
        $count = ['total' => 0, 'new' => 0, 'updated' => 0, 'slots' => 0];
        $records = new GigRecord($this->database, new Gigs($this->database));
        foreach ($rows as ['line' => $line, 'cells' => $cells]) {
            $at = fn (string $column, string $error, ?string $value = null) => $this->problems->add('gigs.csv', $line, $column, $error, $value);
            $cell = fn (string $column) => trim($cells[$column] ?? '');
            $startsOn = Values::day($cell('startsOn'));
            if ($cell('name') === '' || $startsOn === null) {
                $cell('name') === '' ? $at('name', 'required') : $at('startsOn', $cell('startsOn') === '' ? 'required' : 'invalid', $cell('startsOn'));
                continue;
            }
            $key = $this->gigKey($cell('name'), $startsOn);
            if (isset($this->gigs[$key])) {
                $at('name', 'twice', $cell('name'));
                continue;
            }
            $count['total']++;
            $current = $this->database->fetchAssociative('SELECT * FROM gig WHERE name = ? AND startsOn = ?', [$cell('name'), $startsOn]) ?: null;
            $id = $current === null ? null : (int) $current['id'];
            $kept = fn (string $column, ?string $field = null) => $cell($column) !== '' ? $cell($column) : (is_scalar($current[$field ?? $column] ?? null) ? (string) $current[$field ?? $column] : null);

            $status = (string) ($current['status'] ?? 'PROPOSED');
            if ($cell('status') !== '') {
                $code = Values::code($cell('status'), Values::list('gigStatus', $this->language));
                $code === null ? $at('status', 'unknownValue', $cell('status')) : $status = $code;
            }
            $meetingTime = $kept('meetingTime');
            if ($cell('meetingTime') !== '') {
                $meetingTime = Values::time($cell('meetingTime'));
                if ($meetingTime === null) {
                    $at('meetingTime', 'invalid', $cell('meetingTime'));
                }
            } elseif ($meetingTime !== null) {
                $meetingTime = substr($meetingTime, 0, 5);
            }
            $endsOn = $kept('endsOn');
            if ($cell('endsOn') !== '' && Values::day($cell('endsOn')) === null) {
                $at('endsOn', 'invalid', $cell('endsOn'));
            }
            $endsOn = $cell('endsOn') !== '' ? Values::day($cell('endsOn')) : $endsOn;
            $coordinate = function (string $column) use ($cell, $at, $current): ?float {
                if ($cell($column) === '') {
                    return is_numeric($current[$column] ?? null) ? (float) $current[$column] : null;
                }
                $value = Values::decimal($cell($column));
                if ($value === null) {
                    $at($column, 'invalid', $cell($column));
                }

                return $value;
            };

            $organizers = null;
            if ($cell('organizers') !== '') {
                $organizers = [];
                foreach (Values::several($cell('organizers')) as $email) {
                    $email = mb_strtolower($email);
                    $this->memberExists($email) ? $organizers[] = $email : $at('organizers', 'unknownMember', $email);
                }
            }
            $costumeIds = $id === null ? [] : array_map(intval(...), $this->database->fetchFirstColumn('SELECT costumeId FROM gigCostume WHERE gigId = ?', [$id]));
            if ($cell('costumes') !== '') {
                $costumeIds = [];
                foreach (Values::several($cell('costumes')) as $costume) {
                    $costumeId = $this->costumes[Values::plain($costume)] ?? null;
                    $costumeId === null ? $at('costumes', 'unknownCostume', $costume) : $costumeIds[] = $costumeId;
                }
            }

            try {
                $values = $records->check(new GigInput(
                    name: $cell('name'),
                    startsOn: $startsOn,
                    endsOn: $endsOn,
                    meetingTime: $meetingTime,
                    placeName: $kept('placeName'),
                    placeUrl: $kept('placeUrl'),
                    streetAddress: $kept('streetAddress'),
                    postalCode: $kept('postalCode'),
                    city: $kept('city'),
                    latitude: $coordinate('latitude'),
                    longitude: $coordinate('longitude'),
                    notes: $kept('notes'),
                    discordChannelId: $kept('discordChannel', 'discordChannelId'),
                ), $id);
            } catch (ApiError $refused) {
                foreach ($refused->fields as $field => $error) {
                    $column = $field === 'discordChannelId' ? 'discordChannel' : (string) $field;
                    $at($column, (string) $error, $cell($column));
                }
                continue;
            }

            $slots = [];
            if ($id !== null) {
                foreach ($this->database->fetchAllAssociative('SELECT id, position FROM gigSlot WHERE gigId = ?', [$id]) as $slot) {
                    $slots[(int) $slot['position']] = (int) $slot['id'];
                }
            }
            $this->gigs[$key] = ['id' => $id, 'costumeIds' => array_values(array_unique($costumeIds)), 'slots' => $slots];
            $count[$id === null ? 'new' : 'updated']++;
            $plan[$key] = [
                'id' => $id,
                'values' => [...$values, 'status' => $status],
                'organizers' => $organizers,
                'costumeIds' => $cell('costumes') !== '' ? array_values(array_unique($costumeIds)) : null,
                'slots' => [],
            ];
        }

        // slots.csv: by gig and position.
        $named = [];
        foreach ($slotRows as ['line' => $line, 'cells' => $cells]) {
            $at = fn (string $column, string $error, ?string $value = null) => $this->problems->add('slots.csv', $line, $column, $error, $value);
            $cell = fn (string $column) => trim($cells[$column] ?? '');
            $key = $this->gigOf($cell('gigName'), $cell('gigStartsOn'), $at);
            $position = Values::integer($cell('position'));
            if ($position === null || $position < 1 || $position > 50) {
                $at('position', $cell('position') === '' ? 'required' : 'invalid', $cell('position'));
            }
            if ($key === null || $position === null || $position < 1 || $position > 50) {
                continue;
            }
            if (isset($named[$key][$position])) {
                $at('position', 'twice', (string) $position);
                continue;
            }
            $costumeId = null;
            if ($cell('costume') !== '') {
                $costumeId = $this->costumes[Values::plain($cell('costume'))] ?? null;
                if ($costumeId === null || !in_array($costumeId, $this->gigs[$key]['costumeIds'], true)) {
                    $at('costume', 'costumeNotOfGig', $cell('costume'));
                    continue;
                }
            }
            $name = $cell('name');
            $note = $cell('note');
            if (mb_strlen($name) > 40 || mb_strlen($note) > 1000) {
                $at(mb_strlen($name) > 40 ? 'name' : 'note', 'tooLong');
                continue;
            }
            $named[$key][$position] = $line;
            $count['slots']++;
            $plan[$key] ??= ['id' => $this->gigs[$key]['id'], 'values' => null, 'organizers' => null, 'costumeIds' => null, 'slots' => []];
            $plan[$key]['slots'][$position] = ['name' => $name === '' ? null : $name, 'note' => $note === '' ? null : $note, 'costumeId' => $costumeId];
            $this->gigs[$key]['slots'][$position] ??= 0;
        }
        // A gig of several slots names each of them (Gigs domain, "Slots").
        foreach ($plan as $key => $gig) {
            $positions = array_keys($this->gigs[$key]['slots']) ?: [1];
            if (count($positions) > 1) {
                foreach ($gig['slots'] as $position => $slot) {
                    $hasName = $slot['name'] !== null || ($this->gigs[$key]['id'] !== null && $this->database->fetchOne('SELECT name FROM gigSlot WHERE gigId = ? AND position = ? AND name IS NOT NULL', [$this->gigs[$key]['id'], $position]) !== false);
                    if (!$hasName) {
                        $this->problems->add('slots.csv', $named[$key][$position] ?? null, 'name', 'slotWithoutName', (string) $position);
                    }
                }
            }
            // A new gig without a row in slots.csv gets one slot.
            if ($gig['id'] === null && $gig['slots'] === []) {
                $plan[$key]['slots'][1] = ['name' => null, 'note' => null, 'costumeId' => null];
                $this->gigs[$key]['slots'][1] = 0;
            }
        }

        return [array_map(fn (string $key, array $gig) => [...$gig, 'key' => $key], array_keys($plan), $plan), $count];
    }

    // ------------------------------------------------------------------
    // answers.csv
    // ------------------------------------------------------------------

    /**
     * @param list<array{line: int, cells: array<string, string>}> $rows
     * @return array{list<array<string, mixed>>, array<string, int>}
     */
    private function answers(array $rows): array
    {
        $plan = [];
        $seen = [];
        $count = ['total' => 0];
        foreach ($rows as ['line' => $line, 'cells' => $cells]) {
            $at = fn (string $column, string $error, ?string $value = null) => $this->problems->add('answers.csv', $line, $column, $error, $value);
            $cell = fn (string $column) => trim($cells[$column] ?? '');
            $key = $this->gigOf($cell('gigName'), $cell('gigStartsOn'), $at);
            $position = $cell('slotPosition') === '' ? 1 : Values::integer($cell('slotPosition'));
            $email = mb_strtolower($cell('memberEmail'));
            $answer = Values::code($cell('answer'), Values::list('answer', $this->language));
            if ($email === '' || !$this->memberExists($email)) {
                $at('memberEmail', $email === '' ? 'required' : 'unknownMember', $email);
            }
            if ($answer === null) {
                $at('answer', $cell('answer') === '' ? 'required' : 'unknownValue', $cell('answer'));
            }
            if ($key !== null && ($position === null || !isset($this->gigs[$key]['slots'][$position]))) {
                $at('slotPosition', 'unknownSlot', $cell('slotPosition') === '' ? '1' : $cell('slotPosition'));

                continue;
            }
            if ($key === null || $email === '' || !$this->memberExists($email) || $answer === null) {
                continue;
            }
            if (isset($seen["{$key}|{$position}|{$email}"])) {
                $at('memberEmail', 'twice', $email);
                continue;
            }
            $seen["{$key}|{$position}|{$email}"] = true;
            $count['total']++;
            $plan[] = ['gigKey' => $key, 'position' => $position, 'email' => $email, 'answer' => $answer];
        }

        return [$plan, $count];
    }

    // The key of a gig in this reprise: its name and its first day, compared
    // as the database compares them.
    private function gigKey(string $name, string $startsOn): string
    {
        return Values::plain($name) . '|' . $startsOn;
    }

    /**
     * The gig a row of slots.csv or answers.csv names, found in gigs.csv or
     * in the installation; null, with its problem, when there is none.
     *
     * @param callable(string, string, ?string=): void $at
     */
    private function gigOf(string $name, string $startsOnCell, callable $at): ?string
    {
        $startsOn = Values::day($startsOnCell);
        if ($name === '' || $startsOn === null) {
            $name === '' ? $at('gigName', 'required') : $at('gigStartsOn', $startsOnCell === '' ? 'required' : 'invalid', $startsOnCell);

            return null;
        }
        $key = $this->gigKey($name, $startsOn);
        if (!isset($this->gigs[$key])) {
            $gig = $this->database->fetchAssociative('SELECT id FROM gig WHERE name = ? AND startsOn = ?', [$name, $startsOn]);
            if ($gig === false) {
                $at('gigName', 'unknownGig', "{$name} ({$startsOn})");

                return null;
            }
            $slots = [];
            foreach ($this->database->fetchAllAssociative('SELECT id, position FROM gigSlot WHERE gigId = ?', [(int) $gig['id']]) as $slot) {
                $slots[(int) $slot['position']] = (int) $slot['id'];
            }
            $costumeIds = array_map(intval(...), $this->database->fetchFirstColumn('SELECT costumeId FROM gigCostume WHERE gigId = ?', [(int) $gig['id']]));
            $this->gigs[$key] = ['id' => (int) $gig['id'], 'costumeIds' => $costumeIds, 'slots' => $slots];
        }

        return $key;
    }

    // A member a row refers to: in members.csv, or already in the installation.
    private function memberExists(string $email): bool
    {
        return isset($this->knownMembers[$email]) || isset($this->fileMembers[$email]);
    }
}
