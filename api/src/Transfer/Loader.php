<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Access\PasswordLinks;
use BrassBand\Members\Members;
use BrassBand\Members\PersonalData;
use BrassBand\Songs\ClipThumbnails;
use BrassBand\Songs\SongFiles;
use BrassBand\Songs\SongRecord;
use BrassBand\Songs\SpokenNames;
use BrassBand\Storage\Files;
use Doctrine\DBAL\Connection;

// Writes what a reprise or an import read (model/export-import.md): all or
// nothing, in one transaction. The files are written first, each in a new
// folder of storage/ as an upload is; if anything fails they are deleted and
// nothing is saved. The files they replace are deleted once the rows are
// saved, never before.
//
// No notification leaves: a load brings in what already existed (decided on
// 2026-10-24). A gig loaded is never shown as new, and no gig is confirmed by
// the app because of an answer loaded.
final class Loader
{
    /** @var list<string> Paths written by this load, deleted if it fails */
    private array $written = [];
    /** @var list<string> Paths replaced by this load, deleted once it is saved */
    private array $replaced = [];
    /** @var array<string, int> Members by email, once written */
    private array $memberIds = [];

    public function __construct(
        private readonly Connection $database,
        private readonly PersonalData $personal,
        private readonly Files $files,
        private readonly PasswordLinks $links,
        private readonly ClipThumbnails $thumbnails,
        private readonly \ZipArchive $zip,
        private readonly int $byMemberId,
    ) {
    }

    /**
     * Writes a plan of Reprise::read(). Returns the tokens of the
     * invitations to send, by member id: empty when none is to leave.
     *
     * @param array<string, mixed> $plan
     * @return array<int, string>
     */
    public function loadReprise(array $plan, bool $invites): array
    {
        $thumbnails = $this->fetchThumbnails($plan['songs'] ?? []);
        try {
            $tokens = $this->database->transactional(function () use ($plan, $invites, $thumbnails): array {
                $this->memberIds = array_flip($this->personal->emailsById());
                $tokens = $this->members($plan['members'] ?? [], $invites);
                $this->songs($plan['songs'] ?? [], $thumbnails);
                $gigIds = $this->gigs($plan['gigs'] ?? []);
                $this->answers($plan['answers'] ?? [], $gigIds);

                return $tokens;
            });
        } catch (\Throwable $failure) {
            foreach ($this->written as $path) {
                $this->files->delete($path);
            }
            throw $failure;
        }
        foreach ($this->replaced as $path) {
            $this->files->delete($path);
        }

        return $tokens;
    }

    /**
     * @param list<array<string, mixed>> $members
     * @return array<int, string>
     */
    private function members(array $members, bool $invites): array
    {
        $tokens = [];
        foreach ($members as $member) {
            $values = $member['values'];
            $values['updatedByMemberId'] = $this->byMemberId;
            $id = $member['id'];
            $previousPhoto = null;
            if ($id === null) {
                $this->database->insert('member', $this->personal->sealed($values));
                $id = (int) $this->database->lastInsertId();
            } else {
                $previousPhoto = $this->database->fetchOne('SELECT photoPath FROM member WHERE id = ? FOR UPDATE', [$id]);
                $this->database->update('member', $this->personal->sealed($values), ['id' => $id]);
            }
            $this->memberIds[(string) $member['email']] = $id;

            if ($member['roles'] !== null) {
                Members::replaceRoles($this->database, $this->links, $id, $member['roles'], $this->byMemberId);
            }
            if ($values['status'] === 'LEFT') {
                // Their access ends, and their photo goes, as when someone leaves in the app.
                $this->database->delete('memberSession', ['memberId' => $id]);
                $this->links->cancel($id);
                $this->database->update('member', ['photoPath' => null, 'passwordHash' => null], ['id' => $id]);
                $this->replace(is_string($previousPhoto) ? $previousPhoto : null);
            } elseif ($member['photo'] !== null) {
                $name = "photo.{$member['photo']['extension']}";
                $path = $this->write('members', [$name => $member['photo']['image']]) . "/{$name}";
                $this->database->update('member', ['photoPath' => $path], ['id' => $id]);
                $this->replace(is_string($previousPhoto) ? $previousPhoto : null);
            }
            if ($member['invite'] && $invites) {
                $tokens[$id] = $this->links->create($id, $this->byMemberId, emailed: true, isInvitation: true);
            }
        }

        return $tokens;
    }

    /**
     * @param list<array<string, mixed>> $songs
     * @param array<string, array{name: string, content: string}|null> $thumbnails By clip address
     */
    private function songs(array $songs, array $thumbnails): void
    {
        $spoken = new SpokenNames($this->database);
        foreach ($songs as $song) {
            $values = $song['values'];
            $values['updatedByMemberId'] = $this->byMemberId;
            $id = $song['id'];
            $current = $id === null ? null : $this->database->fetchAssociative('SELECT * FROM song WHERE id = ? FOR UPDATE', [$id]);
            // The thumbnail of the clip, fetched when the video changes, as in the app.
            $video = $values['clipUrl'] === null ? null : ClipThumbnails::videoId((string) $values['clipUrl']);
            $previousVideo = is_string($current['clipUrl'] ?? null) ? ClipThumbnails::videoId($current['clipUrl']) : null;
            if ($video !== $previousVideo) {
                $thumbnail = $values['clipUrl'] === null ? null : ($thumbnails[(string) $values['clipUrl']] ?? null);
                $values['clipThumbnailPath'] = $thumbnail === null ? null : $this->write('songs', [$thumbnail['name'] => $thumbnail['content']]) . "/{$thumbnail['name']}";
                $this->replace(is_string($current['clipThumbnailPath'] ?? null) ? $current['clipThumbnailPath'] : null);
            }
            if ($id === null) {
                $this->database->insert('song', $values);
                $id = (int) $this->database->lastInsertId();
            } else {
                $this->database->update('song', $values, ['id' => $id]);
            }

            SongRecord::replaceAttributes($this->database, $id, $song['positions'], $song['tiring'], $song['tricky'], $this->byMemberId);
            if ($song['spokenNames'] !== null) {
                $this->database->delete('songSpokenName', ['songId' => $id]);
                $row = ['id' => $id, 'name' => $values['name']];
                foreach ($song['spokenNames'] as $phrase) {
                    $spoken->give($row, $phrase, true, $this->byMemberId);
                }
            }

            // Each file given replaces the one of the same kind; the others stay.
            $columns = [];
            foreach ($song['files'] as $kind => $entry) {
                // Its size was checked when the zip was read (Reprise::songFiles).
                $content = (string) ZipFiles::read($this->zip, $entry, SongFiles::MAX_BYTES[$kind]);
                $name = SongFiles::nameOf($kind, $content);
                $columns[SongFiles::COLUMNS[$kind]] = $this->write('songs', [$name => $content]) . "/{$name}";
            }
            // A new MuseScore file without its MIDI file or its MusicXML: those
            // of the earlier score are no longer its own (Songs domain, as in the app).
            if (isset($song['files']['museScore'])) {
                $columns['midiPath'] ??= null;
                $columns['musicXmlPath'] ??= null;
            }
            if ($columns !== []) {
                $previous = $this->database->fetchAssociative('SELECT ' . implode(', ', array_keys($columns)) . ' FROM song WHERE id = ?', [$id]) ?: [];
                $this->database->update('song', $columns, ['id' => $id]);
                foreach ($previous as $path) {
                    $this->replace(is_string($path) ? $path : null);
                }
            }
            foreach ($song['parts'] as $instrumentId => $entry) {
                $content = (string) ZipFiles::read($this->zip, $entry, SongFiles::MAX_BYTES['part']);
                $path = $this->write('songs', ['part.pdf' => $content]) . '/part.pdf';
                $previous = $this->database->fetchOne('SELECT pdfPath FROM songPart WHERE songId = ? AND instrumentId = ?', [$id, $instrumentId]);
                if ($previous === false) {
                    $this->database->insert('songPart', ['songId' => $id, 'instrumentId' => $instrumentId, 'pdfPath' => $path, 'updatedByMemberId' => $this->byMemberId]);
                } else {
                    $this->database->update('songPart', ['pdfPath' => $path, 'updatedByMemberId' => $this->byMemberId], ['songId' => $id, 'instrumentId' => $instrumentId]);
                    $this->replace(is_string($previous) ? $previous : null);
                }
            }
        }
    }

    /**
     * @param list<array<string, mixed>> $gigs
     * @return array<string, int> The id of each gig, by its key in the plan
     */
    private function gigs(array $gigs): array
    {
        $ids = [];
        foreach ($gigs as $gig) {
            $id = $gig['id'];
            if ($gig['values'] !== null) {
                $values = [...$gig['values'], 'updatedByMemberId' => $this->byMemberId];
                if ($id === null) {
                    // Never shown as new (decided on 2026-10-24): the instant it
                    // was first shown to members is put out of the 15 days.
                    $values['proposedAt'] = $values['status'] === 'DRAFT' ? null : gmdate('Y-m-d H:i:s', time() - 16 * 86400);
                    $this->database->insert('gig', $values);
                    $id = (int) $this->database->lastInsertId();
                } else {
                    $this->database->update('gig', $values, ['id' => $id]);
                }
            }
            $ids[(string) $gig['key']] = (int) $id;

            if ($gig['organizers'] !== null) {
                $this->database->delete('gigOrganizer', ['gigId' => $id]);
                foreach (array_unique($gig['organizers']) as $email) {
                    $this->database->insert('gigOrganizer', ['gigId' => $id, 'memberId' => $this->memberIds[$email], 'updatedByMemberId' => $this->byMemberId]);
                }
            }
            if ($gig['costumeIds'] !== null) {
                // A slot keeps a costume of its gig only.
                $this->database->executeStatement(
                    'UPDATE gigSlot SET costumeId = NULL WHERE gigId = ?' . ($gig['costumeIds'] === [] ? '' : ' AND costumeId NOT IN (' . implode(', ', array_map(intval(...), $gig['costumeIds'])) . ')'),
                    [$id],
                );
                // Those the list no longer holds go; those it adds come. A
                // costume kept stays as it is: a slot may wear it.
                $this->database->executeStatement(
                    'DELETE FROM gigCostume WHERE gigId = ?' . ($gig['costumeIds'] === [] ? '' : ' AND costumeId NOT IN (' . implode(', ', array_map(intval(...), $gig['costumeIds'])) . ')'),
                    [$id],
                );
                foreach ($gig['costumeIds'] as $costumeId) {
                    $this->database->executeStatement(
                        'INSERT IGNORE INTO gigCostume (gigId, costumeId, updatedByMemberId) VALUES (?, ?, ?)',
                        [$id, $costumeId, $this->byMemberId],
                    );
                }
            }
            foreach ($gig['slots'] as $position => $slot) {
                $slotId = $this->database->fetchOne('SELECT id FROM gigSlot WHERE gigId = ? AND position = ?', [$id, $position]);
                if ($slotId === false) {
                    $this->database->insert('gigSlot', ['gigId' => $id, 'position' => $position, ...$slot, 'updatedByMemberId' => $this->byMemberId]);
                } else {
                    // An empty cell leaves the slot as it is.
                    $changes = array_filter($slot, fn ($value) => $value !== null);
                    if ($changes !== []) {
                        $this->database->update('gigSlot', [...$changes, 'updatedByMemberId' => $this->byMemberId], ['id' => (int) $slotId]);
                    }
                }
            }
        }

        return $ids;
    }

    /**
     * @param list<array{gigKey: string, position: int, email: string, answer: string}> $answers
     * @param array<string, int> $gigIds
     */
    private function answers(array $answers, array $gigIds): void
    {
        foreach ($answers as $answer) {
            $gigId = $gigIds[$answer['gigKey']] ?? $this->gigIdOf($answer['gigKey']);
            $slotId = (int) $this->database->fetchOne('SELECT id FROM gigSlot WHERE gigId = ? AND position = ?', [$gigId, $answer['position']]);
            $this->database->executeStatement(
                'INSERT INTO gigSlotAttendance (gigSlotId, memberId, answer, updatedByMemberId) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE answer = VALUES(answer), updatedByMemberId = VALUES(updatedByMemberId)',
                [$slotId, $this->memberIds[$answer['email']], $answer['answer'], $this->byMemberId],
            );
        }
    }

    // A gig of the installation an answer names, by the key of the plan.
    private function gigIdOf(string $key): int
    {
        [$plainName, $startsOn] = explode('|', $key);
        foreach ($this->database->fetchAllAssociative('SELECT id, name FROM gig WHERE startsOn = ?', [$startsOn]) as $gig) {
            if (Values::plain((string) $gig['name']) === $plainName) {
                return (int) $gig['id'];
            }
        }
        throw new \RuntimeException('A gig of the plan is gone');
    }

    /**
     * The thumbnails of the clips that change, fetched before the
     * transaction: it asks another server, which can take seconds.
     *
     * @param list<array<string, mixed>> $songs
     * @return array<string, array{name: string, content: string}|null>
     */
    private function fetchThumbnails(array $songs): array
    {
        $fetched = [];
        foreach ($songs as $song) {
            $url = $song['values']['clipUrl'] ?? null;
            if (!is_string($url) || isset($fetched[$url])) {
                continue;
            }
            $current = $song['id'] === null ? null : $this->database->fetchOne('SELECT clipUrl FROM song WHERE id = ?', [$song['id']]);
            $video = ClipThumbnails::videoId($url);
            if ($video !== null && (!is_string($current) || ClipThumbnails::videoId($current) !== $video)) {
                $fetched[$url] = $this->thumbnails->fetch($video);
            }
        }

        return $fetched;
    }

    /** @param array<string, string> $files */
    private function write(string $area, array $files): string
    {
        $path = $this->files->write($area, $files);
        $this->written[] = $path;

        return $path;
    }

    private function replace(?string $path): void
    {
        if ($path !== null) {
            $this->replaced[] = $path;
        }
    }
}
