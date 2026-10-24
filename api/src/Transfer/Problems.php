<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

// What is wrong in a file that is read for an import or a reprise, every
// fault of it, before anything is written (model/export-import.md, "All or
// nothing"). Each problem names its file, its line when it has one (the row
// of a spreadsheet), the column, a key the front translates and the value
// that was read: "members.csv, ligne 12 : l’instrument « Sax mib » n’existe
// pas ici". The server writes no sentence.
final class Problems
{
    // Enough for an admin to see what kind of faults the file has; a file
    // with thousands of them is first of all the wrong file.
    private const MOST = 200;

    /** @var list<array{file: string, line: int|null, column: string|null, error: string, value: string|null}> */
    private array $found = [];
    private int $count = 0;

    public function add(string $file, ?int $line, ?string $column, string $error, ?string $value = null): void
    {
        $this->count++;
        if (count($this->found) < self::MOST) {
            $this->found[] = ['file' => $file, 'line' => $line, 'column' => $column, 'error' => $error, 'value' => $value === null ? null : mb_substr($value, 0, 120)];
        }
    }

    public function isEmpty(): bool
    {
        return $this->count === 0;
    }

    // How many were found so far: compared before and after a step.
    public function count(): int
    {
        return $this->count;
    }

    /** @return array{count: int, problems: list<array{file: string, line: int|null, column: string|null, error: string, value: string|null}>} */
    public function view(): array
    {
        return ['count' => $this->count, 'problems' => $this->found];
    }
}
