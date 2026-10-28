<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\Text;
use Doctrine\DBAL\Connection;

// Says where each file dropped on a song goes, from its name alone: its kind
// from its extension, and for a PDF the instrument its name tells. Rules:
// model/songs.md, "Import" and "Reading the name of a file".
//
// The name of a track of a MIDI file is read by the same rule ("Reading the
// name of a track"): the rule is written here once, in instruments().
//
// This only prepares what the member is shown before anything is sent. What
// a file really is is judged from its content when it arrives (SongFiles).
final class FileNames
{
    private const ROLES = [
        'jpg' => 'cover',
        'jpeg' => 'cover',
        'png' => 'cover',
        'webp' => 'cover',
        'mscz' => 'museScore',
        'mid' => 'midi',
        'midi' => 'midi',
        'musicxml' => 'musicXml',
        'mxl' => 'musicXml',
        'mp3' => 'audio',
        'm4a' => 'audio',
        'pdf' => 'part',
    ];

    // The accented letters of the languages the app is likely to meet, and
    // the letter each is read as. Written here because not every PHP has the
    // extension that knows them all.
    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * @param list<string> $names
     * @return list<array{name: string, role: string|null, instrumentId: int|null, problem: string|null}>
     *         role: cover, museScore, midi, musicXml, audio or part; null for a file of
     *         another kind. problem: unknownKind, noInstrument or
     *         severalInstruments.
     */
    public function place(array $names): array
    {
        $spellings = $this->spellings();

        return array_map(function (string $name) use ($spellings): array {
            $role = self::ROLES[strtolower(pathinfo($name, PATHINFO_EXTENSION))] ?? null;
            if ($role !== 'part') {
                return ['name' => $name, 'role' => $role, 'instrumentId' => null, 'problem' => $role === null ? 'unknownKind' : null];
            }

            $instruments = self::instruments(self::words(pathinfo($name, PATHINFO_FILENAME)), $spellings);

            return [
                'name' => $name,
                'role' => 'part',
                'instrumentId' => count($instruments) === 1 ? $instruments[0] : null,
                'problem' => match (count($instruments)) {
                    0 => 'noInstrument',
                    1 => null,
                    default => 'severalInstruments',
                },
            ];
        }, $names);
    }

    /**
     * The instrument each track of a MIDI file is, from its name: the whole
     * name is read, a track has no extension.
     *
     * @param list<string> $names
     * @return list<array{name: string, instrumentId: int|null}>
     *         instrumentId: null when the name tells no instrument, or several.
     */
    public function tracks(array $names): array
    {
        $spellings = $this->spellings();

        return array_map(function (string $name) use ($spellings): array {
            $instruments = self::instruments(self::words($name), $spellings);

            return ['name' => $name, 'instrumentId' => count($instruments) === 1 ? $instruments[0] : null];
        }, $names);
    }

    /**
     * A text cut into words: lowercase, accents removed, everything that is
     * not a letter or a digit is a separation.
     *
     * @return list<string>
     */
    public static function words(string $text): array
    {
        return array_values(array_filter(preg_split('/[^a-z0-9]+/', Text::plain($text)) ?: [], fn (string $word) => $word !== ''));
    }

    /**
     * Every spelling of every instrument: its aliases, and its own name,
     * which is always one.
     *
     * @return list<array{instrumentId: int, words: list<string>}>
     */
    private function spellings(): array
    {
        $rows = $this->database->fetchAllAssociative(
            'SELECT id AS instrumentId, name AS spelling FROM instrument
             UNION ALL SELECT instrumentId, alias FROM instrumentAlias',
        );

        return array_map(fn (array $row) => [
            'instrumentId' => (int) $row['instrumentId'],
            'words' => self::words((string) $row['spelling']),
        ], $rows);
    }

    /**
     * The instruments a name tells. A spelling matches when all its words are
     * in the name, as whole words; the spelling with the most words wins.
     *
     * @param list<string> $words
     * @param list<array{instrumentId: int, words: list<string>}> $spellings
     * @return list<int>
     */
    private static function instruments(array $words, array $spellings): array
    {
        $most = 0;
        $found = [];
        foreach ($spellings as $spelling) {
            $count = count($spelling['words']);
            if ($count === 0 || $count < $most || array_diff($spelling['words'], $words) !== []) {
                continue;
            }
            if ($count > $most) {
                $most = $count;
                $found = [];
            }
            $found[$spelling['instrumentId']] = true;
        }

        return array_keys($found);
    }
}
