import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { Button } from '../../components/Button.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { type SongSortColumn, SongTable } from '../../components/SongTable.tsx';
import { instrumentsOf, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import {
  isPlayed,
  type LevelAverage,
  type SongSummary,
  songStatuses,
  useSongs,
} from '../../songs.ts';
import { AppLayout } from '../AppLayout.tsx';
import { useIsDesktop } from './device.ts';
import { average, day } from './format.ts';
import { StatusChip } from './SongsScreen.tsx';
import './songs.css';

// Figma: Songs / Manage — table. For whoever manages songs, from the desktop
// width: one line per song, with what tells which ones should leave the
// repertoire (the averages of the band) and which ones lack parts.
export function ManageSongsScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const me = useMe().data;
  const songs = useSongs();
  const instrumentCount = instrumentsOf(useSections().data).length;
  const isDesktop = useIsDesktop();
  const [withProposed, setProposed] = useState(false);
  const [withAbandoned, setAbandoned] = useState(false);
  const [sort, setSort] = useState<{ column: SongSortColumn; descending: boolean }>({
    column: 'name',
    descending: false,
  });

  if (me && !me.permissions.includes('manageSongs')) return <Navigate to="/songs" replace />;

  const all = songs.data ?? [];
  const shown = all.filter(
    (song) =>
      isPlayed(song.status) ||
      (withProposed && song.status === 'PROPOSED') ||
      (withAbandoned && song.status === 'ABANDONED'),
  );
  // A song nobody answered for, or without a version, goes last whatever the direction.
  const sortValue = (song: SongSummary): string | number | null => {
    switch (sort.column) {
      case 'status':
        return songStatuses.indexOf(song.status);
      case 'parts':
        return song.partCount;
      case 'mastery':
        return song.mastery.average;
      case 'enjoyment':
        return song.enjoyment.average;
      case 'version':
        return song.versionOn;
      default:
        return song.name;
    }
  };
  const sorted = [...shown].sort((a, b) => {
    const [first, second] = [sortValue(a), sortValue(b)];
    if (first === null || second === null) {
      return first === second
        ? a.name.localeCompare(b.name, i18n.language)
        : first === null
          ? 1
          : -1;
    }
    const order =
      typeof first === 'string' && typeof second === 'string'
        ? first.localeCompare(second, i18n.language)
        : Number(first) - Number(second);
    return (sort.descending ? -order : order) || a.name.localeCompare(b.name, i18n.language);
  });

  const proposed = shown.filter((song) => song.status === 'PROPOSED').length;
  const ratingText = (level: LevelAverage) =>
    level.average === null
      ? t('songs.manage.noAnswer')
      : t('songs.manage.rating', {
          average: average(level.average, i18n.language),
          count: level.count,
        });

  return (
    <AppLayout
      current="songs"
      back="/songs"
      backLabel={t('nav.songs')}
      title={t('songs.manage.title')}
      subtitle={
        songs.isSuccess
          ? proposed > 0
            ? t('songs.manage.subtitleProposed', { count: shown.length, proposed })
            : t('songs.manage.subtitle', { count: shown.length })
          : undefined
      }
      action={
        <Button size="small" icon="Plus" onClick={() => navigate('/songs/new')}>
          {t('songs.list.add')}
        </Button>
      }
      toolbar={
        <>
          <FilterChip pressed={withProposed} onChange={setProposed}>
            {t('songs.list.filterProposed')}
          </FilterChip>
          <FilterChip pressed={withAbandoned} onChange={setAbandoned}>
            {t('songs.list.filterAbandoned')}
          </FilterChip>
        </>
      }
    >
      {songs.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
      {songs.isPending && <p role="status">{t('songs.list.loading')}</p>}
      {!isDesktop && <Message>{t('songs.manage.phoneOnlyDesktop')}</Message>}
      {isDesktop && songs.data !== undefined && (
        <Sheet>
          <div className="songs-table">
            <SongTable
              songs={sorted}
              instrumentCount={instrumentCount}
              sort={sort}
              onSort={(column) =>
                setSort((current) => ({
                  column,
                  descending: current.column === column ? !current.descending : false,
                }))
              }
              labels={{
                caption: t('songs.manage.title'),
                name: t('songs.manage.column.name'),
                status: t('songs.manage.column.status'),
                parts: t('songs.manage.column.parts'),
                mastery: t('songs.manage.column.mastery'),
                enjoyment: t('songs.manage.column.enjoyment'),
                version: t('songs.manage.column.version'),
              }}
              rowTo={(song) => `/songs/${song.id}/edit`}
              status={(song) => <StatusChip song={song} />}
              ratingText={ratingText}
              ratingLabel={(kind, level) => {
                const name = t(`songs.manage.column.${kind}`);
                return level.average === null
                  ? t('songs.manage.noRatingLabel', { kind: name })
                  : t('songs.manage.ratingLabel', {
                      kind: name,
                      count: level.count,
                      average: average(level.average, i18n.language),
                    });
              }}
              gaugeText={(song) =>
                t('songs.manage.parts', { count: song.partCount, total: instrumentCount })
              }
              version={(song) =>
                song.versionOn
                  ? day(song.versionOn, i18n.language, 'short')
                  : t('songs.manage.noVersion')
              }
            />
          </div>
        </Sheet>
      )}
    </AppLayout>
  );
}
