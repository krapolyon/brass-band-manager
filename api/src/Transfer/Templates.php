<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Install\Languages;
use Doctrine\DBAL\Connection;

// "Télécharger les modèles" (model/export-import.md, "Who, and how"): a zip
// made by the server for this installation. The five CSV files with their
// header row and two made-up example rows, the folders of the photos and of
// the songs, and allowed-values.csv, which lists every accepted value of
// every column that has a list: those of the model, written once in
// transfer.<language>.json, and those of this installation (instruments
// with their known spellings, sections, costumes, languages).
final class Templates
{
    public function __construct(private readonly Connection $database)
    {
    }

    /** Writes the zip of the templates to a file. */
    public function write(string $file): void
    {
        $language = (string) ($this->database->fetchOne('SELECT defaultLanguage FROM band WHERE id = 1') ?: Languages::DEFAULT);
        $instrument = (string) ($this->database->fetchOne('SELECT i.name FROM instrument i JOIN section s ON s.id = i.sectionId ORDER BY s.position, i.position LIMIT 1') ?: '');

        $zip = new \ZipArchive();
        if ($zip->open($file, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('The templates cannot be written');
        }
        foreach (Reprise::FILES as $name => $columns) {
            $examples = array_map(
                fn (array $row) => array_map(fn (string $cell) => str_replace('{instrument}', $instrument, $cell), array_slice(array_pad($row, count($columns), ''), 0, count($columns))),
                Values::examples($name, $language),
            );
            $zip->addFromString("{$name}.csv", Csv::write($columns, $examples));
        }
        $zip->addEmptyDir('members/photos');
        $zip->addEmptyDir('songs');
        $zip->addFromString('allowed-values.csv', Csv::write(['column', 'code', 'label'], $this->allowed($language)));
        $zip->close();
    }

    /** @return list<list<string>> */
    private function allowed(string $language): array
    {
        $rows = [];
        $add = function (string $columns, array $list) use (&$rows): void {
            foreach (explode(',', $columns) as $column) {
                foreach ($list as $code => $label) {
                    $rows[] = [$column, (string) $code, (string) $label];
                }
            }
        };
        $add('members.status', Values::list('memberStatus', $language));
        $add('members.roles', Values::list('role', $language));
        $add('songs.status', Values::list('songStatus', $language));
        $add('songs.mood', Values::list('mood', $language));
        $add('songs.positions', Values::list('position', $language));
        $add('gigs.status', Values::list('gigStatus', $language));
        $add('answers.answer', Values::list('answer', $language));

        // The instruments of the band, then each of their known spellings.
        foreach ($this->database->fetchAllAssociative('SELECT i.id, i.name FROM instrument i JOIN section s ON s.id = i.sectionId ORDER BY s.position, i.position') as $instrument) {
            $rows[] = ['members.instrument', (string) $instrument['name'], (string) $instrument['name']];
            foreach ($this->database->fetchFirstColumn('SELECT alias FROM instrumentAlias WHERE instrumentId = ? ORDER BY alias', [$instrument['id']]) as $alias) {
                $rows[] = ['members.instrument', (string) $alias, (string) $instrument['name']];
            }
        }
        $sections = array_map(strval(...), $this->database->fetchFirstColumn('SELECT name FROM section ORDER BY position'));
        $add('songs.tiringFor,songs.trickyFor', array_combine($sections, $sections));
        $costumes = array_map(strval(...), $this->database->fetchFirstColumn('SELECT name FROM costume ORDER BY position'));
        $add('gigs.costumes,slots.costume', array_combine($costumes, $costumes));
        $add('members.language', array_combine(Languages::AVAILABLE, Languages::AVAILABLE));

        return $rows;
    }
}
