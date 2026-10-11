<?php

declare(strict_types=1);

namespace BrassBand\Sections;

use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Text;
use Doctrine\DBAL\Connection;

// What the actions on sections and instruments share: how they are listed,
// their names, and their order. Rules: model/members.md, entry 2.
final class Sections
{
    public const NAME_MAX_LENGTH = 50;

    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * The sections of the band with their instruments, in the order of the band.
     *
     * @return list<array{id: int, name: string, position: int, instruments: list<array{id: int, name: string, position: int}>}>
     */
    public function all(): array
    {
        $instruments = [];
        $rows = $this->database->fetchAllAssociative('SELECT id, sectionId, name, position FROM instrument ORDER BY position, name');
        foreach ($rows as $instrument) {
            $instruments[(int) $instrument['sectionId']][] = [
                'id' => (int) $instrument['id'],
                'name' => (string) $instrument['name'],
                'position' => (int) $instrument['position'],
            ];
        }

        $sections = [];
        foreach ($this->database->fetchAllAssociative('SELECT id, name, position FROM section ORDER BY position, name') as $section) {
            $sections[] = [
                'id' => (int) $section['id'],
                'name' => (string) $section['name'],
                'position' => (int) $section['position'],
                'instruments' => $instruments[(int) $section['id']] ?? [],
            ];
        }

        return $sections;
    }

    // Checks the name of a section or of an instrument and returns it as it
    // will be saved. A name is unique in its table whatever its case and its
    // accents, as the database compares it.
    public function name(string $table, string $name, ?int $exceptId): string
    {
        $errors = new FieldErrors();
        $errors->text('name', $name, self::NAME_MAX_LENGTH);
        $name = Text::clean($name);
        $taken = (int) $this->database->fetchOne(
            "SELECT COUNT(*) FROM {$table} WHERE name = ? AND id <> ?",
            [$name, $exceptId ?? 0],
        );
        if ($taken > 0) {
            $errors->add('name', 'duplicate');
        }
        $errors->throwIfAny();

        return $name;
    }

    // 404 unless a row of this table has this id.
    public function mustExist(string $table, int $id): void
    {
        if ((int) $this->database->fetchOne("SELECT COUNT(*) FROM {$table} WHERE id = ?", [$id]) === 0) {
            throw new ApiError(404, 'notFound');
        }
    }

    /**
     * Puts a row at a place in its list (1 is the first) and numbers the
     * whole list again from 1. The list is every section, or the instruments
     * of one section.
     *
     * @param int|null $sectionId For an instrument: the section whose list it is
     */
    public function place(string $table, int $id, int $position, ?int $sectionId, int $byMemberId): void
    {
        $where = $sectionId === null ? '1 = 1' : 'sectionId = ' . $sectionId;
        $ids = array_map(
            intval(...),
            $this->database->fetchFirstColumn("SELECT id FROM {$table} WHERE {$where} ORDER BY position, name FOR UPDATE"),
        );
        $ids = array_values(array_filter($ids, fn (int $other) => $other !== $id));
        array_splice($ids, max(0, min($position - 1, count($ids))), 0, [$id]);

        foreach ($ids as $index => $rowId) {
            $this->database->executeStatement(
                "UPDATE {$table} SET position = ?, updatedByMemberId = IF(position = ?, updatedByMemberId, ?) WHERE id = ?",
                [$index + 1, $index + 1, $byMemberId, $rowId],
            );
        }
    }

    // The position after the last row of a list.
    public function end(string $table, ?int $sectionId): int
    {
        $where = $sectionId === null ? '1 = 1' : 'sectionId = ' . $sectionId;

        return (int) $this->database->fetchOne("SELECT COALESCE(MAX(position), 0) + 1 FROM {$table} WHERE {$where}");
    }
}
