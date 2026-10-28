import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar, initialsOf } from './Avatar.tsx';
import { Icon } from './Icon.tsx';
import { Pictogram } from './Pictogram.tsx';
import './MemberTable.css';

export type MemberTableRow = {
  id: number;
  nickname: string;
  /** "Marie-Lou Fontaine". */
  name: string;
  photoUrl: string | null;
  instrument: string;
  sectionIcon: string | null;
  /** The status in words, or a Chip when it is not the ordinary one. */
  status: ReactNode;
  /** "Gère les fanfarons, Gère les plans"; empty when the member holds no role. */
  roles: string;
  /** The record of the member. */
  to: string;
  /** Read before the name by a screen reader: "Ouvrir la fiche de". */
  openVerb: string;
  muted?: boolean;
};

type Props = {
  /** For screen readers: what the table lists. */
  caption: string;
  /** The titles of the four columns: member, instrument, status, roles. */
  columns: [string, string, string, string];
  rows: MemberTableRow[];
};

// Figma: Member/TableHeader and Member/TableRow. The members as a table, on a
// desktop, for those who manage them: one line per member, the status in its
// own column. The nickname is the link that opens the record, stretched over
// the whole line (Figma: "The whole line opens the record"). The More icon at
// the end is drawn as an IconButton in Figma, but what it would offer is not
// drawn: until it is, it is part of the line and opens the record too.
export function MemberTable({ caption, columns, rows }: Props) {
  return (
    <table className="MemberTable">
      <caption className="visuallyHidden">{caption}</caption>
      <thead>
        <tr className="textCaption">
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
          <td aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} data-muted={row.muted ? 'true' : undefined}>
            <th scope="row">
              <Link className="MemberTable-member" to={row.to}>
                <span className="visuallyHidden">{row.openVerb} </span>
                <Avatar photoUrl={row.photoUrl} initials={initialsOf(row.nickname)} />
                <span className="MemberTable-texts">
                  <span className="MemberTable-nickname textBodyStrong">{row.nickname}</span>
                  <span className="MemberTable-name textCaption">{row.name}</span>
                </span>
              </Link>
            </th>
            <td className="textBody">
              <span className="MemberTable-instrument">
                <Pictogram name={row.sectionIcon} size={20} />
                {row.instrument}
              </span>
            </td>
            <td className="MemberTable-muted textBody">{row.status}</td>
            <td className="MemberTable-muted textBody">{row.roles}</td>
            <td className="MemberTable-chevron" aria-hidden="true">
              <Icon name="More" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
