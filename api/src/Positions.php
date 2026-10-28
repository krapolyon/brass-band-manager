<?php

declare(strict_types=1);

namespace BrassBand;

use Doctrine\DBAL\Connection;

// A list kept in order by a "position" column (1 is the first): the sections,
// the instruments of a section, the costumes, the slots of a gig. Moving a
// row numbers the whole list again from 1, so that positions never have gaps
// nor twins. Call it inside a transaction: the rows are held until its end.
//
// The table and the condition are written in the code, never taken from a
// request; the values of the condition are passed apart:
//
//   Positions::place($database, 'instrument', 'sectionId = ?', [$sectionId], 'name', $id, 3, $me->id);
final class Positions
{
    /**
     * Puts a row at a place in its list and numbers the list again. Without a
     * row, only numbers it again.
     *
     * @param string $list The SQL condition that keeps the rows of the list
     * @param list<int> $values The values of its placeholders
     * @param string $tieBreak The column that orders two rows of the same position
     */
    public static function place(
        Connection $database,
        string $table,
        string $list,
        array $values,
        string $tieBreak,
        ?int $id,
        int $position,
        int $byMemberId,
    ): void {
        $ids = array_map(
            intval(...),
            $database->fetchFirstColumn("SELECT id FROM {$table} WHERE {$list} ORDER BY position, {$tieBreak} FOR UPDATE", $values),
        );
        if ($id !== null) {
            $ids = array_values(array_filter($ids, fn (int $other) => $other !== $id));
            array_splice($ids, max(0, min($position - 1, count($ids))), 0, [$id]);
        }

        foreach ($ids as $index => $rowId) {
            // The member is written only on the rows whose position changes.
            $database->executeStatement(
                "UPDATE {$table} SET position = ?, updatedByMemberId = IF(position = ?, updatedByMemberId, ?) WHERE id = ?",
                [$index + 1, $index + 1, $byMemberId, $rowId],
            );
        }
    }

    /**
     * The position after the last row of a list: where a new row goes.
     *
     * @param list<int> $values
     */
    public static function end(Connection $database, string $table, string $list, array $values): int
    {
        return (int) $database->fetchOne("SELECT COALESCE(MAX(position), 0) + 1 FROM {$table} WHERE {$list}", $values);
    }
}
