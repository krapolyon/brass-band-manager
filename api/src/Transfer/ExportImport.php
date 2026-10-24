<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Access\PasswordLinks;
use BrassBand\Access\Role;
use BrassBand\Band\LogoInput;
use BrassBand\Band\LogoStore;
use BrassBand\Gigs\CostumePictures;
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
use BrassBand\Sections\SectionIcons;
use BrassBand\Songs\SetPosition;
use BrassBand\Songs\SongFiles;
use BrassBand\Songs\SongInput;
use BrassBand\Songs\SongMood;
use BrassBand\Songs\SongRecord;
use BrassBand\Songs\SongStatus;
use BrassBand\Songs\SpokenNames;
use BrassBand\Storage\Files;
use Doctrine\DBAL\Connection;

// Imports an export of the app, format 1 (model/export-import.md). The file
// is first checked whole: its format, the SHA-256 of each of its files, and
// that the admin who imports is an admin in it. Then each part chosen is
// applied, in the order of its dependencies (settings, members, songs,
// gigs), inside one transaction, every row checked by the same rules as the
// screens of the app (MemberRecord, SongRecord, GigRecord, the checks of an
// upload): a reference to a row of an earlier part is then found the way the
// app finds it.
//
// Reading a file for the screen runs the same work and undoes it (dryRun):
// what the screen counts, and every problem, is what the import would do.
// An import that meets a problem undoes everything too.
//
// Add or update, never delete (decided with the owner on 2026-10-24): a row
// of the installation that the file does not hold stays. Inside a row of the
// file, its own lists are replaced: the roles of a member, the parts, files
// and phrases of a song, the slots, organisers, costumes, answers and
// setlists of a gig.
final class ExportImport
{
    public const PART_FILES = ['settings' => 'settings/data.json', 'members' => 'members/data.json', 'songs' => 'songs/data.json', 'gigs' => 'gigs/data.json'];

    private readonly Problems $problems;
    /** @var array<string, string> File in the zip => sha256 from the manifest */
    private array $hashes = [];
    /** @var list<string> */
    private array $written = [];
    /** @var list<string> */
    private array $replaced = [];
    /** @var array<int, string> Invitations to send, token by member id */
    private array $tokens = [];
    private bool $dryRun = true;

    public function __construct(
        private readonly Connection $database,
        private readonly PersonalData $personal,
        private readonly Files $files,
        private readonly PasswordLinks $links,
        private readonly \ZipArchive $zip,
        private readonly int $importerId,
        private readonly string $importerEmail,
    ) {
        $this->problems = new Problems();
    }

    public static function isExport(\ZipArchive $zip): bool
    {
        return $zip->locateName('manifest.json') !== false;
    }

    /**
     * The manifest of the file, or null with its problem when it cannot be read.
     *
     * @return array<string, mixed>|null
     */
    public function manifest(): ?array
    {
        $manifest = json_decode((string) $this->zip->getFromName('manifest.json'), true);
        if (!is_array($manifest) || ($manifest['app'] ?? null) !== 'brass-band-manager' || !is_int($manifest['format'] ?? null)) {
            $this->problems->add('manifest.json', null, null, 'notAnExport');

            return null;
        }
        if ($manifest['format'] > Exporter::FORMAT) {
            $this->problems->add('manifest.json', null, null, 'newerFormat', (string) $manifest['format']);

            return null;
        }

        return $manifest;
    }

    /**
     * Checks the file and applies the parts chosen; undoes it all when it is
     * a dry run or when a problem was found.
     *
     * @param list<string> $parts The parts to import, among those of the file
     * @return array{problems: Problems, summary: array<string, mixed>, tokens: array<int, string>, members: bool}
     */
    public function run(array $parts, bool $dryRun, bool $invites): array
    {
        $this->dryRun = $dryRun;
        $summary = ['kind' => 'export', 'parts' => []];
        $manifest = $this->manifest();
        if ($manifest === null) {
            return ['problems' => $this->problems, 'summary' => $summary, 'tokens' => [], 'members' => false];
        }
        $inFile = array_values(array_intersect(Exporter::PARTS, is_array($manifest['parts'] ?? null) ? $manifest['parts'] : []));
        $parts = array_values(array_intersect($inFile, $parts));
        $summary = [
            ...$summary,
            'format' => $manifest['format'],
            'exportedAt' => is_string($manifest['exportedAt'] ?? null) ? $manifest['exportedAt'] : null,
            'inFile' => $inFile,
        ];
        $this->checkHashes($manifest);
        $data = [];
        foreach ($parts as $part) {
            $read = json_decode((string) $this->zip->getFromName(self::PART_FILES[$part]), true);
            if (!is_array($read)) {
                $this->problems->add(self::PART_FILES[$part], null, null, 'unreadable');
                continue;
            }
            $data[$part] = $read;
        }
        // The admin who imports must be an admin in the file: they keep the
        // hand on the installation.
        if (isset($data['members'])) {
            $isAdmin = false;
            foreach (self::rows($data['members'], 'member') as $member) {
                if (mb_strtolower((string) ($member['email'] ?? '')) === $this->importerEmail && in_array(Role::ADMIN->value, (array) ($member['roles'] ?? []), true)) {
                    $isAdmin = true;
                }
            }
            if (!$isAdmin) {
                $this->problems->add('members/data.json', null, null, 'adminNotInFile', $this->importerEmail);
            }
        }
        if (!$this->problems->isEmpty()) {
            return ['problems' => $this->problems, 'summary' => $summary, 'tokens' => [], 'members' => false];
        }

        $this->database->beginTransaction();
        try {
            if (isset($data['settings'])) {
                $summary['parts']['settings'] = $this->settings($data['settings']);
            }
            if (isset($data['members'])) {
                $summary['parts']['members'] = $this->members($data['members'], $invites);
            }
            if (isset($data['songs'])) {
                $summary['parts']['songs'] = $this->songs($data['songs']);
            }
            if (isset($data['gigs'])) {
                $summary['parts']['gigs'] = $this->gigs($data['gigs']);
            }
            $summary['invitations'] = $summary['parts']['members']['invitations'] ?? 0;
        } catch (\Throwable $failure) {
            $this->undo();
            throw $failure;
        }
        if ($this->dryRun || $this->problems->count() > 0) {
            $this->undo();

            return ['problems' => $this->problems, 'summary' => $summary, 'tokens' => [], 'members' => false];
        }
        $this->database->commit();
        foreach ($this->replaced as $path) {
            $this->files->delete($path);
        }

        return ['problems' => $this->problems, 'summary' => $summary, 'tokens' => $this->tokens, 'members' => isset($data['members'])];
    }

    private function undo(): void
    {
        if ($this->database->isTransactionActive()) {
            $this->database->rollBack();
        }
        foreach ($this->written as $path) {
            $this->files->delete($path);
        }
    }

    /** @param array<string, mixed> $manifest */
    private function checkHashes(array $manifest): void
    {
        foreach (is_array($manifest['files'] ?? null) ? $manifest['files'] : [] as $path => $hash) {
            $content = $this->zip->getFromName((string) $path);
            if ($content === false) {
                $this->problems->add((string) $path, null, null, 'missingFile');
            } elseif ('sha256:' . hash('sha256', $content) !== $hash) {
                $this->problems->add((string) $path, null, null, 'alteredFile');
            } else {
                $this->hashes[(string) $path] = (string) $hash;
            }
        }
    }

    /**
     * A file a row names, inside its part: its content, or null with a
     * problem when the manifest does not vouch for it.
     */
    private function file(string $part, mixed $path, string $where): ?string
    {
        if (!is_string($path)) {
            return null;
        }
        $inZip = "{$part}/{$path}";
        if (!isset($this->hashes[$inZip])) {
            $this->problems->add($inZip, null, null, 'missingFile', $where);

            return null;
        }

        return (string) $this->zip->getFromName($inZip);
    }

    // ------------------------------------------------------------------
    // settings: band, section, instrument, instrumentAlias
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed> $data
     * @return array<string, int>
     */
    private function settings(array $data): array
    {
        $file = 'settings/data.json';
        $band = self::rows($data, 'band')[0] ?? null;
        if (!is_array($band)) {
            $this->problems->add($file, null, 'band', 'required');

            return [];
        }
        $current = (array) $this->database->fetchAssociative('SELECT * FROM band WHERE id = 1 FOR UPDATE');
        $values = [];
        foreach (['name' => 80, 'defaultLanguage' => 10, 'defaultAccentTheme' => 20, 'defaultCountryCode' => 2] as $field => $max) {
            $value = trim((string) ($band[$field] ?? ''));
            if ($value === '' || mb_strlen($value) > $max) {
                $this->problems->add($file, null, $field, 'invalid', $value);
            }
            $values[$field] = $value;
        }
        if (!Languages::isAvailable($values['defaultLanguage'])) {
            $this->problems->add($file, null, 'defaultLanguage', 'invalid', $values['defaultLanguage']);
        }
        if (!in_array($values['defaultAccentTheme'], \BrassBand\Access\AccentThemes::AVAILABLE, true)) {
            // A theme this version does not ship: the band takes the first one.
            $values['defaultAccentTheme'] = \BrassBand\Access\AccentThemes::AVAILABLE[0];
        }
        foreach (['gigFirstReminderDays', 'gigSecondReminderDays', 'gigReminderHour', 'setlistTargetMinutes', 'setlistGapSeconds', 'discordServerId'] as $field) {
            $values[$field] = $band[$field] ?? null;
        }
        $values['gigReminderHour'] ??= 18;
        $values['setlistTargetMinutes'] ??= 45;
        $values['setlistGapSeconds'] ??= 30;

        // The logo and the icon of the app, with the icons drawn from them.
        foreach (['logo' => 'logoPath', 'appIcon' => 'iconPath'] as $name => $column) {
            $values[$column] = null;
            $main = $band[$name] ?? null;
            if (!is_string($main)) {
                continue;
            }
            $image = $this->file('settings', $main, $name);
            $icons = [];
            foreach (LogoStore::ICON_SIZES as $size) {
                $icons[$size] = $this->file('settings', dirname($main) . "/icon-{$size}.png", $name) ?? '';
            }
            if ($image === null) {
                continue;
            }
            $errors = new FieldErrors();
            $logos = new LogoStore($this->database, $this->files);
            $input = new LogoInput(base64_encode($image), base64_encode($icons[180]), base64_encode($icons[192]), base64_encode($icons[512]));
            $read = $name === 'logo' ? $logos->read($errors, $name, $input) : $logos->readAppIcon($errors, $name, $input);
            if ($read === null) {
                $this->problems->add("settings/{$main}", null, null, 'invalidFile');
                continue;
            }
            $values[$column] = $this->dryRun ? null : $this->remember($logos->write($read, $name));
            $this->replace($current[$column] ?? null);
        }
        $values['updatedByMemberId'] = $this->importerId;
        try {
            $this->database->update('band', $values, ['id' => 1]);
        } catch (\Doctrine\DBAL\Exception\DriverException) {
            $this->problems->add($file, null, 'band', 'invalid');
        }

        // Sections, instruments and known spellings: added or updated by name.
        $sections = 0;
        foreach (self::rows($data, 'section') as $section) {
            $name = trim((string) ($section['name'] ?? ''));
            $icon = is_string($section['icon'] ?? null) && in_array($section['icon'], SectionIcons::AVAILABLE, true) ? $section['icon'] : null;
            $row = ['name' => $name, 'position' => (int) ($section['position'] ?? 0), 'icon' => $icon, 'discordRoleId' => $section['discordRoleId'] ?? null, 'updatedByMemberId' => $this->importerId];
            $this->upsert('section', ['name' => $name], $row, $file, 'section', $name);
            $sections++;
        }
        foreach (self::rows($data, 'instrument') as $instrument) {
            $name = trim((string) ($instrument['name'] ?? ''));
            $sectionId = $this->database->fetchOne('SELECT id FROM section WHERE name = ?', [(string) ($instrument['section'] ?? '')]);
            if ($sectionId === false) {
                $this->problems->add($file, null, 'instrument', 'unknownSection', (string) ($instrument['section'] ?? ''));
                continue;
            }
            $this->upsert('instrument', ['name' => $name], ['name' => $name, 'sectionId' => (int) $sectionId, 'position' => (int) ($instrument['position'] ?? 0), 'updatedByMemberId' => $this->importerId], $file, 'instrument', $name);
        }
        foreach (self::rows($data, 'instrumentAlias') as $alias) {
            $instrumentId = $this->database->fetchOne('SELECT id FROM instrument WHERE name = ?', [(string) ($alias['instrument'] ?? '')]);
            if ($instrumentId === false) {
                $this->problems->add($file, null, 'instrumentAlias', 'unknownInstrument', (string) ($alias['instrument'] ?? ''));
                continue;
            }
            $this->upsert('instrumentAlias', ['alias' => (string) ($alias['alias'] ?? '')], ['alias' => (string) ($alias['alias'] ?? ''), 'instrumentId' => (int) $instrumentId, 'updatedByMemberId' => $this->importerId], $file, 'instrumentAlias', (string) ($alias['alias'] ?? ''));
        }

        return ['sections' => $sections];
    }

    // ------------------------------------------------------------------
    // members: member, memberRole
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed> $data
     * @return array<string, int>
     */
    private function members(array $data, bool $invites): array
    {
        $file = 'members/data.json';
        $count = ['total' => 0, 'new' => 0, 'updated' => 0, 'invitations' => 0];
        $records = new MemberRecord($this->database, $this->personal);
        $photos = new PhotoStore($this->database, $this->files);
        foreach (self::rows($data, 'member') as $member) {
            $email = mb_strtolower(trim((string) ($member['email'] ?? '')));
            $at = fn (string $column, string $error, ?string $value = null) => $this->problems->add($file, null, $column, $error, $value ?? $email);
            $id = $this->memberId($email);
            $instrumentId = (int) ($this->database->fetchOne('SELECT id FROM instrument WHERE name = ?', [(string) ($member['instrument'] ?? '')]) ?: 0);
            if ($instrumentId === 0) {
                $at('instrument', 'unknownInstrument', (string) ($member['instrument'] ?? ''));
                continue;
            }
            $text = fn (string $field) => is_string($member[$field] ?? null) ? $member[$field] : null;
            try {
                $values = $records->check(new MemberInput(
                    nickname: (string) ($member['nickname'] ?? ''),
                    firstName: (string) ($member['firstName'] ?? ''),
                    lastName: (string) ($member['lastName'] ?? ''),
                    email: $email,
                    instrumentId: $instrumentId,
                    mobilePhone: $text('mobilePhone'),
                    streetAddress: $text('streetAddress'),
                    postalCode: $text('postalCode'),
                    city: $text('city'),
                    countryCode: $text('countryCode'),
                    addressInstructions: $text('addressInstructions'),
                ), $id);
            } catch (ApiError $refused) {
                foreach ($refused->fields as $field => $error) {
                    $at((string) $field, (string) $error);
                }
                continue;
            }
            $status = (string) ($member['status'] ?? '');
            $hash = $text('passwordHash');
            if (!in_array($status, ['INVITED', 'ACTIVE', 'POWER_MEMBER', 'LEFT'], true)) {
                $at('status', 'unknownValue', $status);
                continue;
            }
            // A hash written by PHP's password_hash(), never a password in clear.
            if ($hash !== null && password_get_info($hash)['algo'] === null) {
                $at('passwordHash', 'invalid');
                continue;
            }
            // Without a password a member is invited, or has left.
            if ($hash === null && in_array($status, ['ACTIVE', 'POWER_MEMBER'], true)) {
                $status = 'INVITED';
            }
            $language = $text('language') ?? '';
            $values = [...$values, 'status' => $status, 'passwordHash' => $hash, 'language' => Languages::isAvailable($language) ? $language : Languages::DEFAULT, 'updatedByMemberId' => $this->importerId];

            $previousPhoto = $id === null ? null : $this->database->fetchOne('SELECT photoPath FROM member WHERE id = ?', [$id]);
            $photo = null;
            $content = $this->file('members', $member['photo'] ?? null, $email);
            if ($content !== null) {
                $photo = $photos->read(new FieldErrors(), 'photo', new PhotoInput(base64_encode($content)));
                if ($photo === null) {
                    $this->problems->add('members/' . $member['photo'], null, null, 'invalidPhoto');
                }
            }
            $values['photoPath'] = $photo === null || $this->dryRun ? null : $this->remember($this->files->write('members', ["photo.{$photo['extension']}" => $photo['image']])) . "/photo.{$photo['extension']}";
            $this->replace(is_string($previousPhoto) ? $previousPhoto : null);

            if ($id === null) {
                $this->database->insert('member', $this->personal->sealed($values));
                $id = (int) $this->database->lastInsertId();
                $count['new']++;
            } else {
                $this->database->update('member', $this->personal->sealed($values), ['id' => $id]);
                $count['updated']++;
            }
            $count['total']++;
            $this->database->delete('memberRole', ['memberId' => $id]);
            foreach (array_unique((array) ($member['roles'] ?? [])) as $role) {
                if (Role::tryFrom((string) $role) === null) {
                    $at('roles', 'unknownValue', (string) $role);
                    continue;
                }
                $this->database->insert('memberRole', ['memberId' => $id, 'role' => $role, 'updatedByMemberId' => $this->importerId]);
            }
            // An invited member arrives without a pending link: with the
            // switch on, the import sends them their invitation (#50).
            if ($status === 'INVITED' && $id !== $this->importerId) {
                $count['invitations']++;
                if ($invites && !$this->dryRun) {
                    $this->tokens[$id] = $this->links->create($id, $this->importerId, emailed: true, isInvitation: true);
                }
            }
        }

        return $count;
    }

    // ------------------------------------------------------------------
    // songs: song and its lists, memberSong
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed> $data
     * @return array<string, int>
     */
    private function songs(array $data): array
    {
        $file = 'songs/data.json';
        $count = ['total' => 0, 'new' => 0, 'updated' => 0, 'files' => 0];
        $records = new SongRecord($this->database);
        foreach (self::rows($data, 'song') as $song) {
            $name = (string) ($song['name'] ?? '');
            $at = fn (string $column, string $error, ?string $value = null) => $this->problems->add($file, null, $column, $error, $value ?? $name);
            $current = $this->database->fetchAssociative('SELECT * FROM song WHERE name = ? FOR UPDATE', [$name]) ?: null;
            $id = $current === null ? null : (int) $current['id'];
            $sections = function (string $field) use ($song, $at): array {
                $ids = [];
                foreach ((array) ($song[$field] ?? []) as $section) {
                    $sectionId = $this->database->fetchOne('SELECT id FROM section WHERE name = ?', [(string) $section]);
                    $sectionId === false ? $at($field, 'unknownSection', (string) $section) : $ids[] = (int) $sectionId;
                }

                return $ids;
            };
            $text = fn (string $field) => is_string($song[$field] ?? null) ? $song[$field] : null;
            $integer = fn (string $field) => is_int($song[$field] ?? null) ? $song[$field] : null;
            try {
                $values = $records->check(new SongInput(
                    name: $name,
                    originalTitle: (string) ($song['originalTitle'] ?? ''),
                    originalArtist: (string) ($song['originalArtist'] ?? ''),
                    status: SongStatus::tryFrom((string) ($song['status'] ?? '')) ?? SongStatus::PROPOSED,
                    copyright: $text('copyright'),
                    bpm: $integer('bpm'),
                    versionOn: $text('versionOn'),
                    versionNote: $text('versionNote'),
                    clipUrl: $text('clipUrl'),
                    discordChannelId: $text('discordChannelId'),
                    durationSeconds: $integer('durationSeconds'),
                    inRepertoireOn: $text('inRepertoireOn'),
                    mood: SongMood::tryFrom((string) ($song['mood'] ?? '')) ?? SongMood::MEDIUM,
                    positions: self::positionsOf($song),
                    tiringSectionIds: $sections('tiringFor'),
                    trickySectionIds: $sections('trickyFor'),
                ), $id, $current);
            } catch (ApiError $refused) {
                foreach ($refused->fields as $field => $error) {
                    $at((string) $field, (string) $error);
                }
                continue;
            }

            // Its files, as they were exported: one missing removes it here.
            $columns = [];
            foreach ([...SongFiles::COLUMNS, 'clipThumbnail' => 'clipThumbnailPath'] as $kind => $column) {
                $content = $this->file('songs', $song[$kind] ?? null, $name);
                $columns[$column] = null;
                if ($content === null) {
                    continue;
                }
                try {
                    $stored = $kind === 'clipThumbnail' ? 'clip.' . pathinfo((string) $song[$kind], PATHINFO_EXTENSION) : SongFiles::nameOf($kind, $content);
                } catch (ApiError) {
                    $this->problems->add('songs/' . $song[$kind], null, null, 'invalidFile');
                    continue;
                }
                $files = [$stored => $content];
                $peaks = $kind === 'audio' ? $this->file('songs', $song['peaks'] ?? null, $name) : null;
                if ($peaks !== null) {
                    $files['peaks.json'] = $peaks;
                }
                $columns[$column] = $this->dryRun ? null : $this->remember($this->files->write('songs', $files)) . "/{$stored}";
                $count['files']++;
            }
            if ($columns['clipThumbnailPath'] !== null && $values['clipUrl'] === null) {
                $columns['clipThumbnailPath'] = null;
            }
            foreach ($columns as $column => $path) {
                $this->replace($current[$column] ?? null);
            }
            $values = [...$values, ...$columns, 'updatedByMemberId' => $this->importerId];
            if ($id === null) {
                $this->database->insert('song', $values);
                $id = (int) $this->database->lastInsertId();
                $count['new']++;
            } else {
                $this->database->update('song', $values, ['id' => $id]);
                $count['updated']++;
            }
            $count['total']++;
            (new SongRecord($this->database))->saveAttributes($id, new SongInput(
                name: $name,
                originalTitle: '',
                originalArtist: '',
                status: SongStatus::PROPOSED,
                positions: self::positionsOf($song),
                tiringSectionIds: $sections('tiringFor'),
                trickySectionIds: $sections('trickyFor'),
            ), $this->importerId);

            // Its phrases, its parts and the levels members gave it: replaced.
            $this->database->delete('songSpokenName', ['songId' => $id]);
            $spoken = new SpokenNames($this->database);
            foreach ((array) ($song['spokenNames'] ?? []) as $phrase) {
                try {
                    $spoken->give(['id' => $id, 'name' => $name], (string) $phrase, true, $this->importerId);
                } catch (ApiError) {
                    $at('spokenNames', 'invalid', (string) $phrase);
                }
            }
            foreach ($this->database->fetchFirstColumn('SELECT pdfPath FROM songPart WHERE songId = ?', [$id]) as $path) {
                $this->replace($path);
            }
            $this->database->delete('songPart', ['songId' => $id]);
            foreach ((array) ($song['parts'] ?? []) as $part) {
                $instrumentId = $this->database->fetchOne('SELECT id FROM instrument WHERE name = ?', [(string) ($part['instrument'] ?? '')]);
                $content = $this->file('songs', $part['pdf'] ?? null, $name);
                if ($instrumentId === false) {
                    $at('parts', 'unknownInstrument', (string) ($part['instrument'] ?? ''));
                    continue;
                }
                if ($content === null || !str_starts_with($content, '%PDF-')) {
                    continue;
                }
                $path = $this->dryRun ? 'songs/0000000000000000/part.pdf' : $this->remember($this->files->write('songs', ['part.pdf' => $content])) . '/part.pdf';
                $this->database->insert('songPart', ['songId' => $id, 'instrumentId' => (int) $instrumentId, 'pdfPath' => $path, 'updatedByMemberId' => $this->importerId]);
                $count['files']++;
            }
            $this->database->delete('memberSong', ['songId' => $id]);
            foreach ((array) ($song['levels'] ?? []) as $level) {
                $memberId = $this->memberId(mb_strtolower((string) ($level['memberEmail'] ?? '')));
                if ($memberId === null) {
                    $at('levels', 'unknownMember', (string) ($level['memberEmail'] ?? ''));
                    continue;
                }
                $this->database->insert('memberSong', [
                    'memberId' => $memberId,
                    'songId' => $id,
                    'masteryLevel' => $level['masteryLevel'] ?? null,
                    'enjoymentLevel' => $level['enjoymentLevel'] ?? null,
                    'ratedOn' => $level['ratedOn'] ?? null,
                    'updatedByMemberId' => $this->importerId,
                ]);
            }
        }

        return $count;
    }

    // ------------------------------------------------------------------
    // gigs: costume, gig and its lists, setlists
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed> $data
     * @return array<string, int>
     */
    private function gigs(array $data): array
    {
        $file = 'gigs/data.json';
        $count = ['total' => 0, 'new' => 0, 'updated' => 0];
        $pictures = new CostumePictures($this->database, $this->files);
        foreach (self::rows($data, 'costume') as $costume) {
            $name = trim((string) ($costume['name'] ?? ''));
            $current = $this->database->fetchAssociative('SELECT id, imagePath FROM costume WHERE name = ?', [$name]) ?: null;
            $imagePath = null;
            $content = $this->file('gigs', $costume['picture'] ?? null, $name);
            if ($content !== null) {
                $picture = $pictures->read(new FieldErrors(), 'picture', new PhotoInput(base64_encode($content)));
                if ($picture === null) {
                    $this->problems->add('gigs/' . $costume['picture'], null, null, 'invalidFile');
                } elseif (!$this->dryRun) {
                    $imagePath = $this->remember($this->files->write('costumes', ["picture.{$picture['extension']}" => $picture['image']])) . "/picture.{$picture['extension']}";
                }
            }
            $this->replace($current['imagePath'] ?? null);
            $this->upsert('costume', ['name' => $name], ['name' => $name, 'position' => (int) ($costume['position'] ?? 0), 'imagePath' => $imagePath, 'updatedByMemberId' => $this->importerId], $file, 'costume', $name);
        }

        $records = new GigRecord($this->database, new Gigs($this->database));
        foreach (self::rows($data, 'gig') as $gig) {
            $name = (string) ($gig['name'] ?? '');
            $startsOn = (string) ($gig['startsOn'] ?? '');
            $at = fn (string $column, string $error, ?string $value = null) => $this->problems->add($file, null, $column, $error, $value ?? "{$name} ({$startsOn})");
            $current = $this->database->fetchAssociative('SELECT id FROM gig WHERE name = ? AND startsOn = ? FOR UPDATE', [$name, $startsOn]) ?: null;
            $id = $current === null ? null : (int) $current['id'];
            $text = fn (string $field) => is_string($gig[$field] ?? null) ? $gig[$field] : null;
            $number = fn (string $field) => is_int($gig[$field] ?? null) || is_float($gig[$field] ?? null) ? (float) $gig[$field] : null;
            try {
                $values = $records->check(new GigInput(
                    name: $name,
                    startsOn: $startsOn,
                    endsOn: $text('endsOn'),
                    meetingTime: $text('meetingTime'),
                    placeName: $text('placeName'),
                    placeUrl: $text('placeUrl'),
                    streetAddress: $text('streetAddress'),
                    postalCode: $text('postalCode'),
                    city: $text('city'),
                    latitude: $number('latitude'),
                    longitude: $number('longitude'),
                    notes: $text('notes'),
                    discordChannelId: $text('discordChannelId'),
                ), $id);
            } catch (ApiError $refused) {
                foreach ($refused->fields as $field => $error) {
                    $at((string) $field, (string) $error);
                }
                continue;
            }
            $status = (string) ($gig['status'] ?? '');
            if (!in_array($status, ['DRAFT', 'PROPOSED', 'ACCEPTED', 'CONFIRMED', 'CANCELLED'], true)) {
                $at('status', 'unknownValue', $status);
                continue;
            }
            $instant = fn (string $field) => is_string($gig[$field] ?? null) && strtotime($gig[$field]) !== false ? gmdate('Y-m-d H:i:s', (int) strtotime($gig[$field])) : null;
            $values = [...$values, 'status' => $status, 'proposedAt' => $instant('proposedAt'), 'remindedAt' => $instant('remindedAt'), 'updatedByMemberId' => $this->importerId];
            if ($id === null) {
                $this->database->insert('gig', $values);
                $id = (int) $this->database->lastInsertId();
                $count['new']++;
            } else {
                // Its lists are replaced: what hangs on its slots goes first.
                $this->database->executeStatement('DELETE ss FROM setlistSong ss JOIN setlist s ON s.id = ss.setlistId WHERE s.gigId = ?', [$id]);
                $this->database->delete('setlist', ['gigId' => $id]);
                $this->database->delete('gigSlot', ['gigId' => $id]);
                $this->database->delete('gigCostume', ['gigId' => $id]);
                $this->database->delete('gigOrganizer', ['gigId' => $id]);
                $this->database->update('gig', $values, ['id' => $id]);
                $count['updated']++;
            }
            $count['total']++;

            foreach (array_unique((array) ($gig['organizers'] ?? [])) as $email) {
                $memberId = $this->memberId(mb_strtolower((string) $email));
                $memberId === null
                    ? $at('organizers', 'unknownMember', (string) $email)
                    : $this->database->insert('gigOrganizer', ['gigId' => $id, 'memberId' => $memberId, 'updatedByMemberId' => $this->importerId]);
            }
            $costumeIds = [];
            foreach (array_unique((array) ($gig['costumes'] ?? [])) as $costume) {
                $costumeId = $this->database->fetchOne('SELECT id FROM costume WHERE name = ?', [(string) $costume]);
                if ($costumeId === false) {
                    $at('costumes', 'unknownCostume', (string) $costume);
                    continue;
                }
                $costumeIds[(string) $costume] = (int) $costumeId;
                $this->database->insert('gigCostume', ['gigId' => $id, 'costumeId' => (int) $costumeId, 'updatedByMemberId' => $this->importerId]);
            }
            $slotIds = [];
            foreach ((array) ($gig['slots'] ?? []) as $slot) {
                $position = (int) ($slot['position'] ?? 0);
                $costume = is_string($slot['costume'] ?? null) ? ($costumeIds[$slot['costume']] ?? null) : null;
                $this->database->insert('gigSlot', [
                    'gigId' => $id,
                    'position' => $position,
                    'name' => is_string($slot['name'] ?? null) ? $slot['name'] : null,
                    'note' => is_string($slot['note'] ?? null) ? $slot['note'] : null,
                    'costumeId' => $costume,
                    'updatedByMemberId' => $this->importerId,
                ]);
                $slotIds[$position] = (int) $this->database->lastInsertId();
                foreach ((array) ($slot['answers'] ?? []) as $answer) {
                    $memberId = $this->memberId(mb_strtolower((string) ($answer['memberEmail'] ?? '')));
                    if ($memberId === null || !in_array($answer['answer'] ?? null, ['YES', 'NO', 'MAYBE', 'IF_NEEDED'], true)) {
                        $at('answers', 'unknownMember', (string) ($answer['memberEmail'] ?? ''));
                        continue;
                    }
                    $this->database->insert('gigSlotAttendance', ['gigSlotId' => $slotIds[$position], 'memberId' => $memberId, 'answer' => $answer['answer'], 'updatedByMemberId' => $this->importerId]);
                }
            }
            // A gig always has a slot (Gigs domain, "Slots").
            if ($slotIds === []) {
                $this->database->insert('gigSlot', ['gigId' => $id, 'position' => 1, 'updatedByMemberId' => $this->importerId]);
                $slotIds[1] = (int) $this->database->lastInsertId();
            }
            foreach ((array) ($gig['setlists'] ?? []) as $setlist) {
                $slotId = $slotIds[(int) ($setlist['slotPosition'] ?? 1)] ?? reset($slotIds);
                // The live state of a setlist does not travel.
                $this->database->insert('setlist', ['gigId' => $id, 'gigSlotId' => $slotId, 'number' => (int) ($setlist['number'] ?? 1), 'description' => is_string($setlist['description'] ?? null) ? $setlist['description'] : null, 'updatedByMemberId' => $this->importerId]);
                $setlistId = (int) $this->database->lastInsertId();
                foreach (array_values((array) ($setlist['songs'] ?? [])) as $index => $song) {
                    $songId = $this->database->fetchOne('SELECT id FROM song WHERE name = ?', [(string) $song]);
                    if ($songId === false) {
                        $at('setlists', 'unknownSong', (string) $song);
                        continue;
                    }
                    $this->database->insert('setlistSong', ['setlistId' => $setlistId, 'position' => $index + 1, 'songId' => (int) $songId, 'updatedByMemberId' => $this->importerId]);
                }
            }
        }

        return $count;
    }

    // ------------------------------------------------------------------

    /**
     * Adds a row, or updates the one with the same key. A refusal of the
     * database is a problem of the file, never a failure of the import.
     *
     * @param array<string, mixed> $key
     * @param array<string, mixed> $row
     */
    private function upsert(string $table, array $key, array $row, string $file, string $column, string $value): void
    {
        $where = implode(' AND ', array_map(fn (string $field) => "{$field} = ?", array_keys($key)));
        try {
            $id = $this->database->fetchOne("SELECT id FROM {$table} WHERE {$where}", array_values($key));
            if ($id === false) {
                $this->database->insert($table, $row);
            } else {
                $this->database->update($table, $row, ['id' => (int) $id]);
            }
        } catch (\Doctrine\DBAL\Exception\DriverException) {
            $this->problems->add($file, null, $column, 'invalid', $value);
        }
    }

    // A member of the installation, by email (encrypted: found by its hash).
    private function memberId(string $email): ?int
    {
        if ($email === '') {
            return null;
        }
        [$where, $values] = $this->personal->whereEmail($email);
        foreach ($this->database->fetchAllAssociative("SELECT id, email FROM member WHERE {$where}", $values) as $row) {
            if ($this->personal->opened($row)['email'] === $email) {
                return (int) $row['id'];
            }
        }

        return null;
    }

    private function remember(string $path): string
    {
        $this->written[] = $path;

        return $path;
    }

    private function replace(mixed $path): void
    {
        if (is_string($path) && !$this->dryRun) {
            $this->replaced[] = $path;
        }
    }

    /**
     * The positions of a song of the file; null when it gives none.
     *
     * @param array<string, mixed> $song
     * @return list<SetPosition>|null
     */
    private static function positionsOf(array $song): ?array
    {
        $positions = [];
        foreach ((array) ($song['positions'] ?? []) as $position) {
            $read = SetPosition::tryFrom((string) $position);
            if ($read !== null) {
                $positions[] = $read;
            }
        }

        return $positions === [] ? null : $positions;
    }

    /**
     * The rows of a table of a part, each an array.
     *
     * @param array<string, mixed> $data
     * @return list<array<string, mixed>>
     */
    private static function rows(array $data, string $table): array
    {
        $rows = is_array($data[$table] ?? null) ? $data[$table] : [];

        return array_values(array_filter($rows, 'is_array'));
    }
}
