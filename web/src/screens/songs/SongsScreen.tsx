import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SongCard } from '../../components/SongCard.tsx';
import { SongRow } from '../../components/SongRow.tsx';
import { TextField } from '../../components/TextField.tsx';
import { instrumentsOf, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { isPlayed, type SongSummary, useSongs } from '../../songs.ts';
import { AppLayout } from '../AppLayout.tsx';
import { keep, kept, useIsDesktop } from './device.ts';
import { weight } from './format.ts';
import { MiniPlayer } from './Player.tsx';
import { SongView } from './SongView.tsx';
import './songs.css';

/** A text as the search compares it: lowercase, without accents. */
const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// The status of a song in a list: a Chip, only when it is not the ordinary one.
export function StatusChip({ song }: { song: SongSummary }) {
  const { t } = useTranslation();
  if (song.status === 'IN_REPERTOIRE') return null;

  return (
    <Chip kind={song.status === 'IN_PROGRESS' ? 'accent' : 'neutral'}>
      {t(`songs.status.${song.status}`)}
    </Chip>
  );
}

// Figma: Songs / List (rows and grid), and from the desktop width the list
// beside the song. The songs the band plays or is learning, by name; the
// proposed and the abandoned ones behind two filters, off when the screen
// opens (model/songs.md, "Display").
export function SongsScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const me = useMe().data;
  const songs = useSongs();
  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState('');
  const [withProposed, setProposed] = useState(false);
  const [withAbandoned, setAbandoned] = useState(false);
  const [view, setView] = useState(() => kept('songs.view', 'rows'));
  const [isDownloading, setDownloading] = useState(false);

  const canManage = me?.permissions.includes('manageSongs') ?? false;
  const all = songs.data ?? [];
  const words = plain(search.trim());
  const shown = all
    .filter(
      (song) =>
        isPlayed(song.status) ||
        (withProposed && song.status === 'PROPOSED') ||
        (withAbandoned && song.status === 'ABANDONED'),
    )
    .filter(
      (song) =>
        words === '' ||
        [song.name, song.originalTitle, song.originalArtist].some((text) =>
          plain(text).includes(words),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, i18n.language));

  // On a desktop the song sits beside the list: the one the address names,
  // or the first of the list.
  const asked = params.id ? Number(params.id) : null;
  const openId = asked ?? (isDesktop ? (shown[0]?.id ?? null) : null);

  // Below the desktop width a song takes the whole screen.
  if (!isDesktop && asked !== null) {
    return (
      <main className="songs-screen">
        <SongView key={asked} songId={asked} back="/songs" />
        <MiniPlayer exceptSongId={asked} />
      </main>
    );
  }

  const toggleView = () => {
    const next = view === 'rows' ? 'grid' : 'rows';
    setView(next);
    keep('songs.view', next);
  };
  const isEmpty = songs.isSuccess && all.length === 0;
  // The list of the last visit stays on the screen while the network is away.
  const isOffline = songs.isError && songs.data !== undefined;

  const list = (
    <>
      {isOffline && <Message kind="warning">{t('songs.list.offline')}</Message>}
      {songs.isError && !isOffline && <Message kind="danger">{t('errors.unreachable')}</Message>}
      {songs.isPending && (
        <Sheet>
          <p role="status" className="visuallyHidden">
            {t('songs.list.loading')}
          </p>
          <div className="songs-rows" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="songs-skeleton" data-shape="row" />
            ))}
          </div>
        </Sheet>
      )}
      {isEmpty && (
        <div className="songs-nothing" data-surface="sheet">
          <Icon name="Music" size={32} />
          <h2 className="textHeading">{t('songs.list.emptyTitle')}</h2>
          <p className="songs-muted">
            {t(canManage ? 'songs.list.emptyManager' : 'songs.list.emptyMember')}
          </p>
          {canManage && (
            <Button icon="Plus" onClick={() => navigate('/songs/new')}>
              {t('songs.list.emptyAdd')}
            </Button>
          )}
        </div>
      )}
      {songs.data !== undefined && !isEmpty && shown.length === 0 && (
        <div className="songs-nothing" data-surface="sheet">
          <Icon name="Search" size={32} />
          <h2 className="textHeading">{t('songs.list.nothingFoundTitle')}</h2>
          <p className="songs-muted">{t('songs.list.nothingFound')}</p>
        </div>
      )}
      {shown.length > 0 &&
        (view === 'grid' && !isDesktop ? (
          <ul className="songs-grid">
            {shown.map((song) => (
              <li key={song.id}>
                <SongCard song={song} to={`/songs/${song.id}`} />
              </li>
            ))}
          </ul>
        ) : (
          <Sheet>
            <ul className="songs-rows">
              {shown.map((song) => (
                <li key={song.id}>
                  <SongRow
                    song={song}
                    to={`/songs/${song.id}`}
                    state={isDesktop && song.id === openId ? 'selected' : 'default'}
                    status={<StatusChip song={song} />}
                  />
                </li>
              ))}
            </ul>
          </Sheet>
        ))}
    </>
  );

  const searchField = (
    <TextField
      type="search"
      label={t('songs.list.searchLabel')}
      placeholder={t('songs.list.searchPlaceholder')}
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      trailing={<Icon name="Search" />}
    />
  );

  return (
    <>
      <AppLayout
        current="songs"
        title={t('nav.songs')}
        subtitle={
          songs.isPending
            ? t('songs.list.loading')
            : isEmpty
              ? t('songs.list.emptySubtitle')
              : songs.data !== undefined && !isDesktop
                ? t('songs.list.subtitle', { count: shown.length })
                : undefined
        }
        action={
          <span className="songs-actions">
            {canManage && (
              <>
                <span className="songs-desktopOnly">
                  <Button
                    kind="secondary"
                    size="small"
                    icon="Pencil"
                    onClick={() => navigate('/songs/manage')}
                  >
                    {t('songs.list.manage')}
                  </Button>
                </span>
                <Button
                  kind="secondary"
                  size="small"
                  icon="Plus"
                  onClick={() => navigate('/songs/new')}
                >
                  {t('songs.list.add')}
                </Button>
              </>
            )}
            <IconButton
              kind="glass"
              icon="More"
              label={t('songs.list.more')}
              aria-haspopup="dialog"
              onClick={() => setDownloading(true)}
            />
          </span>
        }
      >
        <div className="songs-split">
          <div className="songs-list">
            {!isEmpty && (
              <>
                {searchField}
                <div className="songs-filters">
                  <FilterChip pressed={withProposed} onChange={setProposed}>
                    {t('songs.list.filterProposed')}
                  </FilterChip>
                  <FilterChip pressed={withAbandoned} onChange={setAbandoned}>
                    {t('songs.list.filterAbandoned')}
                  </FilterChip>
                  {/* The button shows the icon of the other view. Beside a song, the list is always rows. */}
                  <span className="songs-viewSwitch">
                    <IconButton
                      kind="control"
                      icon={view === 'rows' ? 'LayoutGrid' : 'List'}
                      label={t(view === 'rows' ? 'songs.list.showGrid' : 'songs.list.showRows')}
                      onClick={toggleView}
                    />
                  </span>
                </div>
              </>
            )}
            {list}
          </div>
          {isDesktop && openId !== null && (
            <div className="songs-pane">
              <SongView key={openId} songId={openId} headingLevel={2} />
            </div>
          )}
        </div>
      </AppLayout>
      <MiniPlayer exceptSongId={isDesktop ? (openId ?? undefined) : undefined} />

      <DownloadPanel open={isDownloading} onClose={() => setDownloading(false)} songs={shown} />
    </>
  );
}

type DownloadProps = { open: boolean; onClose: () => void; songs: SongSummary[] };

// Figma: Songs / List — download everything. One .zip per kind of file, for
// the songs the list shows: the search and the filters count.
function DownloadPanel({ open, onClose, songs }: DownloadProps) {
  const { t, i18n } = useTranslation();
  const me = useMe().data;
  const instrument = instrumentsOf(useSections().data).find(
    (other) => other.id === me?.instrumentId,
  );
  const instrumentName = instrument?.name ?? '';

  const kinds = [
    { kind: 'parts', size: 'ownPart', label: t('songs.download.parts') },
    { kind: 'audio', size: 'audio', label: t('songs.download.audio') },
    { kind: 'midi', size: 'midi', label: t('songs.download.midi') },
    { kind: 'museScore', size: 'museScore', label: t('songs.download.museScore') },
  ] as const;

  return (
    <Panel open={open} onClose={onClose} title={t('songs.download.title')}>
      <div className="songs-panel">
        <div className="songs-panelGroup">
          {kinds.map(({ kind, size, label }) => {
            const having = songs.filter((song) => song.fileSizes[size] !== null);
            const count = having.length;
            const total = weight(
              having.reduce((sum, song) => sum + (song.fileSizes[size] ?? 0), 0),
              i18n.language,
            );
            const detail =
              count === 0
                ? t('songs.download.none')
                : kind === 'parts'
                  ? t('songs.download.partsDetail', {
                      instrument: instrumentName,
                      count,
                      size: total,
                    })
                  : kind === 'audio'
                    ? t('songs.download.audioDetail', { count, size: total })
                    : t('songs.download.filesDetail', { count, size: total });
            const ids = having.map((song) => song.id).join(',');

            return (
              <NavRow
                key={kind}
                icon="Download"
                label={label}
                detail={detail}
                disabled={count === 0}
                href={count === 0 ? undefined : `/api/songs/archive?kind=${kind}&songs=${ids}`}
                download={`${t(`songs.download.archive.${kind}`, { instrument: instrumentName })}.zip`}
                chevron={false}
              />
            );
          })}
        </div>
        <p className="songs-muted textCaption">{t('songs.download.note')}</p>
      </div>
    </Panel>
  );
}
