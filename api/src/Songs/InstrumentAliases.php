<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\ApiError;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;

// The known spellings of the instruments (instrumentAlias): what the band
// settings list, add and delete. Rules: model/songs.md, entry 2, "Managing
// the aliases". How a spelling is read in a name is in FileNames.
final class InstrumentAliases
{
    // model/songs.md, field `instrumentAlias.alias`.
    private const MIN_LENGTH = 2;
    private const MAX_LENGTH = 25;

    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * Every instrument in the order of the band (sections, then instruments),
     * each with its spellings from A to Z.
     *
     * @return list<array{id: int, name: string, aliases: list<array{id: int, alias: string}>}>
     */
    public function all(): array
    {
        $aliases = [];
        foreach ($this->database->fetchAllAssociative('SELECT id, instrumentId, alias FROM instrumentAlias') as $row) {
            $aliases[(int) $row['instrumentId']][] = ['id' => (int) $row['id'], 'alias' => (string) $row['alias']];
        }

        $instruments = $this->database->fetchAllAssociative(
            'SELECT i.id, i.name FROM instrument i JOIN section s ON s.id = i.sectionId
             ORDER BY s.position, s.name, i.position, i.name',
        );

        return array_map(function (array $instrument) use ($aliases): array {
            $own = $aliases[(int) $instrument['id']] ?? [];
            usort($own, fn (array $one, array $other) => strcmp($one['alias'], $other['alias']));

            return ['id' => (int) $instrument['id'], 'name' => (string) $instrument['name'], 'aliases' => $own];
        }, $instruments);
    }

    /**
     * One instrument as in the list. 404 when there is no such instrument.
     *
     * @return array{id: int, name: string, aliases: list<array{id: int, alias: string}>}
     */
    public function of(int $instrumentId): array
    {
        foreach ($this->all() as $instrument) {
            if ($instrument['id'] === $instrumentId) {
                return $instrument;
            }
        }

        throw new ApiError(404, 'notFound');
    }

    /**
     * A spelling as it is saved: lowercase, without accents, its words
     * separated by one space. The words of the name of the song, when one is
     * given, are left out. Empty when nothing is left.
     */
    public static function clean(string $alias, ?string $songName): string
    {
        $words = array_diff(FileNames::words($alias), FileNames::words($songName ?? ''));

        return implode(' ', array_unique($words));
    }

    /**
     * Gives a spelling to an instrument. Changes nothing when the instrument
     * already has it, or when it is its own name. Refuses what is wrong with
     * the 422 of a field, on "alias": required, tooShort, tooLong, or
     * aliasTaken with the instrument that has it in "takenByInstrumentId".
     */
    public function add(int $instrumentId, string $alias, int $byMemberId): void
    {
        if ($alias === '') {
            throw self::refusal('required');
        }
        if (strlen($alias) < self::MIN_LENGTH) {
            throw self::refusal('tooShort');
        }
        if (strlen($alias) > self::MAX_LENGTH) {
            throw self::refusal('tooLong');
        }

        $holder = $this->holder($alias, $instrumentId);
        if ($holder === $instrumentId) {
            return;
        }
        if ($holder !== null) {
            throw self::refusal('aliasTaken', $holder);
        }

        try {
            $this->database->insert('instrumentAlias', [
                'instrumentId' => $instrumentId,
                'alias' => $alias,
                'updatedByMemberId' => $byMemberId,
            ]);
        } catch (UniqueConstraintViolationException) {
            // Someone gave the same spelling in the meantime.
            $holder = $this->holder($alias, $instrumentId);
            if ($holder !== $instrumentId) {
                throw self::refusal('aliasTaken', $holder);
            }
        }
    }

    /**
     * The instrument a spelling already names: by its aliases, or by its own
     * name, which is always one. The instrument asked for comes first, so
     * that giving it again what it has is not a fault.
     */
    private function holder(string $alias, int $instrumentId): ?int
    {
        $holders = array_map(fn (mixed $id) => (int) $id, $this->database->fetchFirstColumn(
            'SELECT instrumentId FROM instrumentAlias WHERE alias = ?',
            [$alias],
        ));
        foreach ($this->database->fetchAllAssociative('SELECT id, name FROM instrument ORDER BY id') as $instrument) {
            if (self::clean((string) $instrument['name'], null) === $alias) {
                $holders[] = (int) $instrument['id'];
            }
        }

        return in_array($instrumentId, $holders, true) ? $instrumentId : ($holders[0] ?? null);
    }

    private static function refusal(string $problem, ?int $takenByInstrumentId = null): ApiError
    {
        // The fields of a refusal are texts: the instrument is told as one.
        return new ApiError(422, 'invalidInput', [
            'alias' => $problem,
            ...($takenByInstrumentId === null ? [] : ['takenByInstrumentId' => (string) $takenByInstrumentId]),
        ]);
    }
}
