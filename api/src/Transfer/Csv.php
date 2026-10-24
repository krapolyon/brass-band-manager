<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

// Reads one CSV file of a reprise (model/export-import.md, "Rules for every
// CSV file") with PHP's own fgetcsv: quoted cells, a cell over several
// lines, a quote doubled inside a cell. No library: this is all a
// spreadsheet writes.
//
// The separator is ";" or ",", whichever the header row holds (Excel in
// French writes ";"). The file is UTF-8; the mark some programs write at its
// start is dropped. A row is numbered as the spreadsheet numbers it: the
// header is row 1, a cell over several lines does not count twice.
final class Csv
{
    /**
     * @return array{header: list<string>, rows: list<array{line: int, cells: array<string, string>}>}|null Null: not UTF-8
     */
    public static function read(string $content): ?array
    {
        if (str_starts_with($content, "\xEF\xBB\xBF")) {
            $content = substr($content, 3);
        }
        if (!mb_check_encoding($content, 'UTF-8')) {
            return null;
        }
        $firstLine = strtok($content, "\r\n");
        $firstLine = $firstLine === false ? '' : $firstLine;
        $separator = substr_count($firstLine, ';') >= substr_count($firstLine, ',') && str_contains($firstLine, ';') ? ';' : ',';

        $stream = fopen('php://memory', 'r+b');
        if ($stream === false) {
            throw new \RuntimeException('No memory stream');
        }
        fwrite($stream, $content);
        rewind($stream);

        $header = null;
        $rows = [];
        $line = 0;
        while (($cells = fgetcsv($stream, null, $separator, '"', '')) !== false) {
            $line++;
            // A blank line of the spreadsheet holds nothing.
            if ($cells === [null] || implode('', array_map(fn ($cell) => trim((string) $cell), $cells)) === '') {
                continue;
            }
            $cells = array_map(fn ($cell) => trim((string) $cell), $cells);
            if ($header === null) {
                $header = $cells;
                continue;
            }
            $named = [];
            foreach ($header as $index => $column) {
                $named[$column] = $cells[$index] ?? '';
            }
            $rows[] = ['line' => $line, 'cells' => $named];
        }
        fclose($stream);

        return ['header' => $header ?? [], 'rows' => $rows];
    }

    /**
     * A CSV file written for a spreadsheet: ";" between cells, every cell
     * quoted when it needs to be, a mark at the start so that Excel reads
     * UTF-8.
     *
     * @param list<string> $header
     * @param list<list<string>> $rows
     */
    public static function write(array $header, array $rows): string
    {
        $stream = fopen('php://memory', 'r+b');
        if ($stream === false) {
            throw new \RuntimeException('No memory stream');
        }
        foreach ([$header, ...$rows] as $row) {
            fputcsv($stream, $row, ';', '"', '', "\r\n");
        }
        rewind($stream);
        $content = (string) stream_get_contents($stream);
        fclose($stream);

        return "\xEF\xBB\xBF" . $content;
    }
}
