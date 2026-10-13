import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { LevelAverage, SongSummary } from '../songs.ts';
import { Gauge } from './Gauge.tsx';
import { Icon } from './Icon.tsx';
import { Rating } from './Rating.tsx';
import { SongTile } from './SongTile.tsx';
import './SongTable.css';

// The columns of Figma, in its order. Each one can be sorted.
export const songSortColumns = [
  'name',
  'status',
  'parts',
  'mastery',
  'enjoyment',
  'version',
] as const;
export type SongSortColumn = (typeof songSortColumns)[number];

type Props = {
  songs: SongSummary[];
  /** How many instruments the band has: the whole of the gauge of parts. */
  instrumentCount: number;
  sort: { column: SongSortColumn; descending: boolean };
  /** A title was pressed. The screen decides: another column, or the same one the other way. */
  onSort: (column: SongSortColumn) => void;
  /** caption: what the table lists, for screen readers. The others: the title of each column. */
  labels: { caption: string } & Record<SongSortColumn, string>;
  /** The screen of the song. */
  rowTo: (song: SongSummary) => string;
  /** A Chip when the status is not the ordinary one, null otherwise. */
  status: (song: SongSummary) => ReactNode | null;
  /** Under the stars: "4,1 · 12 rép.", or "pas de réponse". */
  ratingText: (average: LevelAverage) => string;
  /** The whole rating in one sentence, for screen readers. */
  ratingLabel: (kind: 'mastery' | 'enjoyment', average: LevelAverage) => string;
  /** Under the gauge: "7 sur 10". */
  gaugeText: (song: SongSummary) => string;
  /** The day of the version, in words: "2 mars". */
  version: (song: SongSummary) => string;
};

// Figma: Song/TableHeader and Song/TableRow. The songs as a table, on a
// desktop, for those who manage them: the parts as a gauge, the averages of
// the band as stars, the day of the version. The name is the link that opens
// the song.
//
// A title is a button that sorts by its column. The sorted column shows an
// arrow, down from A to Z as Figma draws it, up the other way; screen
// readers get it from aria-sort.
export function SongTable({
  songs,
  instrumentCount,
  sort,
  onSort,
  labels,
  rowTo,
  status,
  ratingText,
  ratingLabel,
  gaugeText,
  version,
}: Props) {
  return (
    <table className="SongTable">
      <caption className="visuallyHidden">{labels.caption}</caption>
      <thead>
        <tr>
          {songSortColumns.map((column) => {
            const sorted = column === sort.column;

            return (
              <th
                key={column}
                scope="col"
                data-column={column}
                aria-sort={sorted ? (sort.descending ? 'descending' : 'ascending') : undefined}
              >
                <button className="textLabel" type="button" onClick={() => onSort(column)}>
                  {labels[column]}
                  {sorted && <Icon name={sort.descending ? 'ArrowUp' : 'ArrowDown'} size={16} />}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {songs.map((song) => (
          <tr key={song.id}>
            <th scope="row">
              <Link className="SongTable-song" to={rowTo(song)}>
                <SongTile coverUrl={song.coverUrl} size="small" />
                <span className="SongTable-texts">
                  <span className="SongTable-name textBodyStrong">{song.name}</span>
                  <span className="SongTable-artist textCaption">{song.originalArtist}</span>
                </span>
              </Link>
            </th>
            <td>{status(song)}</td>
            <td>
              <span className="SongTable-parts">
                <Gauge
                  value={song.partCount}
                  total={instrumentCount}
                  text={gaugeText(song)}
                  label={labels.parts}
                />
              </span>
            </td>
            <td>
              <Rating
                average={song.mastery.average}
                text={ratingText(song.mastery)}
                label={ratingLabel('mastery', song.mastery)}
              />
            </td>
            <td>
              <Rating
                average={song.enjoyment.average}
                text={ratingText(song.enjoyment)}
                label={ratingLabel('enjoyment', song.enjoyment)}
              />
            </td>
            <td className="SongTable-version textBody">{version(song)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
