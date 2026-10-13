import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { SetlistSongRow } from '../../components/SetlistSongRow.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { type Gig, useGig } from '../../gigs.ts';
import { useMe } from '../../session.ts';
import { type SongSummary, useSongs } from '../../songs.ts';
import { AppLayout } from '../AppLayout.tsx';
import './gigs.css';

/** A song of the setlist being written. The key follows it when it moves; a song can come twice. */
type Line = { key: string; songId: number; name: string };

type Draft = { gigSlotId: number | null; description: string; lines: Line[] };

let lastKey = 0;
const newKey = () => `line-${++lastKey}`;

/** A text as it is compared: without case, accents or signs. */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** What is sent, and what is compared to know whether something changed. */
const record = (draft: Draft) => ({
  gigSlotId: draft.gigSlotId,
  description: draft.description.trim() || null,
  songIds: draft.lines.map((line) => line.songId),
});

// Figma: Gigs / Setlist — new, and editing (section 11). The setlist of a gig
// is written by typing: a few letters offer the songs the band plays, Enter
// adds the first one and the field stays ready for the next. Everything is
// saved together by the button; leaving with changes asks first. For who
// manages setlists.
export function SetlistFormScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const gigId = Number(params.id);
  const setlistId = params.setlistId ? Number(params.setlistId) : null;
  const gigQuery = useGig(gigId);
  const songs = useSongs().data ?? [];
  const me = useMe().data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef('');
  const form = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [said, setSaid] = useState('');
  const [openLine, setOpenLine] = useState<Line | null>(null);
  const [asks, setAsks] = useState<'delete' | 'leave' | null>(null);
  const [failure, setFailure] = useState<'failed' | 'tooLong' | null>(null);
  const [isSaving, setSaving] = useState(false);

  const gig = gigQuery.data;
  const existing = gig?.setlists.find((setlist) => setlist.id === setlistId);

  // The form starts from what the setlist holds, or from nothing.
  useEffect(() => {
    if (!gig || draft !== null) return;
    if (setlistId !== null && !existing) return;
    const start: Draft = existing
      ? {
          gigSlotId: existing.gigSlotId,
          description: existing.description ?? '',
          lines: existing.songs.map((song) => ({
            key: newKey(),
            songId: song.songId,
            name: song.name,
          })),
        }
      : // The slot is asked only when the gig has several.
        { gigSlotId: gig.slots[0]?.id ?? null, description: '', lines: [] };
    initial.current = JSON.stringify(record(start));
    setDraft(start);
  }, [gig, existing, setlistId, draft]);

  const back = `/gigs/${gigId}`;
  const canManage = me?.permissions.includes('manageSetlists') ?? false;
  const number =
    existing?.number ?? Math.max(0, ...(gig?.setlists ?? []).map((one) => one.number)) + 1;
  const title = t('gigs.setlist.title', { number });

  if (me && !canManage) {
    return (
      <AppLayout current="gigs" back={back} width="form" title={t('manage.noRight.title')}>
        <Message>{t('gigs.setlist.form.noRight')}</Message>
      </AppLayout>
    );
  }
  if (!gig || draft === null) {
    const isMissing = gigQuery.isError || (gig && setlistId !== null && !existing);
    return (
      <AppLayout current="gigs" back={back} width="form" title={title}>
        {gig && gig.status !== 'CONFIRMED' ? (
          <Message>{t('gigs.setlist.form.notConfirmed')}</Message>
        ) : isMissing ? (
          <Message kind="danger">{t('gigs.setlist.liveScreen.notFound')}</Message>
        ) : (
          <p role="status" className="gigs-muted">
            {t('gigs.gig.loading')}
          </p>
        )}
      </AppLayout>
    );
  }
  if (gig.status !== 'CONFIRMED') {
    return (
      <AppLayout current="gigs" back={back} width="form" title={title}>
        <Message>{t('gigs.setlist.form.notConfirmed')}</Message>
      </AppLayout>
    );
  }

  const isDirty = JSON.stringify(record(draft)) !== initial.current;
  const positionOf = (songId: number) =>
    draft.lines.findIndex((line) => line.songId === songId) + 1;

  // The songs the band plays whose name holds what is typed, the ones that
  // start with it first.
  const typed = plain(query);
  const suggestions: SongSummary[] =
    typed === ''
      ? []
      : songs
          .filter((song) => song.status === 'IN_REPERTOIRE' || song.status === 'TEMPORARY')
          .filter((song) => `${plain(song.name)} ${plain(song.originalTitle)}`.includes(typed))
          .sort(
            (a, b) =>
              Number(plain(b.name).startsWith(typed)) - Number(plain(a.name).startsWith(typed)) ||
              a.name.localeCompare(b.name),
          )
          .slice(0, 5);

  const add = (song: SongSummary) => {
    const lines = [...draft.lines, { key: newKey(), songId: song.id, name: song.name }];
    setDraft({ ...draft, lines });
    setQuery('');
    setSaid(t('gigs.setlist.form.added', { name: song.name, position: lines.length }));
    readyForNext();
  };
  // The field that adds a song keeps the focus: it is ready for the next one.
  const readyForNext = () =>
    window.requestAnimationFrame(() =>
      form.current?.querySelector<HTMLInputElement>('.gigs-addSong input')?.focus(),
    );
  const move = (line: Line, by: 1 | -1) => {
    const from = draft.lines.indexOf(line);
    const to = from + by;
    if (from < 0 || to < 0 || to >= draft.lines.length) return;
    const lines = [...draft.lines];
    lines.splice(to, 0, ...lines.splice(from, 1));
    setDraft({ ...draft, lines });
    setSaid(t('gigs.setlist.form.moved', { name: line.name, position: to + 1 }));
  };

  const save = async () => {
    setSaving(true);
    setFailure(null);
    try {
      const saved = await api<Gig>(
        existing ? `/api/setlists/${existing.id}` : `/api/gigs/${gigId}/setlists`,
        { method: existing ? 'PUT' : 'POST', body: record(draft) },
      );
      queryClient.setQueryData(['gig', gigId], saved);
      navigate(back);
    } catch (error) {
      const tooLong = error instanceof ApiError && error.fields.description === 'tooLong';
      setFailure(tooLong ? 'tooLong' : 'failed');
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      const saved = await api<Gig>(`/api/setlists/${existing.id}`, { method: 'DELETE' });
      queryClient.setQueryData(['gig', gigId], saved);
      navigate(back);
    } catch {
      setAsks(null);
      setFailure('failed');
    } finally {
      setSaving(false);
    }
  };

  const openIndex = openLine ? draft.lines.indexOf(openLine) : -1;

  return (
    <AppLayout
      current="gigs"
      back={back}
      onBack={() => (isDirty ? setAsks('leave') : navigate(back))}
      backLabel={gig.name}
      width="form"
      title={title}
      subtitle={gig.name}
      action={
        existing && (
          <IconButton
            kind="glass"
            icon="Trash"
            label={t('gigs.setlist.form.delete')}
            aria-haspopup="dialog"
            onClick={() => setAsks('delete')}
          />
        )
      }
      onSubmit={save}
      actions={
        <BottomBar surface="glass">
          <Button type="submit" disabled={isSaving}>
            {t('gigs.setlist.form.save')}
          </Button>
        </BottomBar>
      }
    >
      <div className="gigs-setlistForm" ref={form}>
        {failure === 'failed' && <Message kind="danger">{t('gigs.setlist.form.failed')}</Message>}
        {gig.slots.length > 1 && (
          <SelectField
            label={t('gigs.setlist.form.slot')}
            hint={t('gigs.setlist.form.slotHint')}
            value={String(draft.gigSlotId ?? '')}
            onChange={(value) => setDraft({ ...draft, gigSlotId: Number(value) })}
            options={gig.slots.map((slot) => ({ value: String(slot.id), label: slot.name ?? '' }))}
          />
        )}
        <TextField
          label={t('gigs.setlist.form.description')}
          error={
            failure === 'tooLong' ? t('gigs.setlist.form.errors.description.tooLong') : undefined
          }
          value={draft.description}
          maxLength={60}
          onChange={(event) => {
            setDraft({ ...draft, description: event.target.value });
            setFailure(null);
          }}
        />

        <section className="gigs-setlistSongs" aria-label={t('gigs.setlist.form.songs')}>
          {draft.lines.length === 0 ? (
            <p className="gigs-muted textCaption">{t('gigs.setlist.form.noSong')}</p>
          ) : (
            <ol>
              {draft.lines.map((line, index) => (
                <SetlistSongRow key={line.key} mode="edit" position={index + 1} name={line.name}>
                  <IconButton
                    icon="More"
                    label={t('gigs.setlist.form.more', { name: line.name })}
                    aria-haspopup="dialog"
                    onClick={() => setOpenLine(line)}
                  />
                </SetlistSongRow>
              ))}
            </ol>
          )}
        </section>

        <div className="gigs-addSong">
          <TextField
            label={t('gigs.setlist.form.addSong')}
            role="combobox"
            aria-expanded={typed !== ''}
            aria-controls="gigs-suggestions"
            aria-describedby="gigs-suggestions-count"
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="done"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSaid('');
            }}
            onKeyDown={(event) => {
              // Enter adds the first suggestion, and never sends the form from here.
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (suggestions[0]) add(suggestions[0]);
            }}
          />
        </div>
        {/* How many songs match, and which one Enter adds. */}
        <p className="visuallyHidden" id="gigs-suggestions-count" aria-live="polite">
          {typed === ''
            ? ''
            : suggestions[0]
              ? t('gigs.setlist.form.suggestionCount', {
                  count: suggestions.length,
                  first: suggestions[0].name,
                })
              : t('gigs.setlist.form.noMatch')}
        </p>
        {typed !== '' && (
          <ul
            className="gigs-suggestions"
            id="gigs-suggestions"
            aria-label={t('gigs.setlist.form.suggestions')}
          >
            {suggestions.map((song, index) => {
              const position = positionOf(song.id);
              const label =
                position > 0
                  ? t('gigs.setlist.form.alreadyAt', { name: song.name, position })
                  : song.name;
              return (
                <li key={song.id}>
                  <button
                    type="button"
                    className="textBodyLarge"
                    data-first={index === 0}
                    aria-label={t('gigs.setlist.form.suggestion', { name: label })}
                    onClick={() => add(song)}
                  >
                    <Icon name="Plus" />
                    {label}
                  </button>
                </li>
              );
            })}
            {suggestions.length === 0 && (
              <li className="gigs-muted textCaption">{t('gigs.setlist.form.noMatch')}</li>
            )}
          </ul>
        )}
        <p className="visuallyHidden" role="status">
          {said}
        </p>
        <p className="gigs-muted textCaption">{t('gigs.setlist.form.help')}</p>
      </div>

      {/* The actions of a song. */}
      <Panel
        open={openLine !== null && openIndex >= 0}
        onClose={() => setOpenLine(null)}
        title={t('gigs.setlist.form.songTitle', {
          name: openLine?.name ?? '',
          position: openIndex + 1,
        })}
      >
        {openLine && (
          <div className="gigs-sheet">
            <Button
              kind="secondary"
              icon="ArrowUp"
              disabled={openIndex === 0}
              onClick={() => move(openLine, -1)}
            >
              {t('gigs.setlist.form.moveUp')}
            </Button>
            <Button
              kind="secondary"
              icon="ArrowDown"
              disabled={openIndex === draft.lines.length - 1}
              onClick={() => move(openLine, 1)}
            >
              {t('gigs.setlist.form.moveDown')}
            </Button>
            <Button
              kind="danger"
              icon="Trash"
              onClick={() => {
                setDraft({ ...draft, lines: draft.lines.filter((line) => line !== openLine) });
                setSaid(t('gigs.setlist.form.removed', { name: openLine.name }));
                setOpenLine(null);
                // Its row is gone: the focus goes to the field that adds a song.
                readyForNext();
              }}
            >
              {t('gigs.setlist.form.remove')}
            </Button>
          </div>
        )}
      </Panel>

      <Panel
        open={asks === 'delete'}
        onClose={() => setAsks(null)}
        title={t('gigs.setlist.form.deleteTitle', { number })}
      >
        <div className="gigs-sheet">
          <p className="textBody">
            {t('gigs.setlist.form.deleteLead', { count: existing?.songs.length ?? 0 })}
          </p>
          <Button kind="danger" icon="Trash" disabled={isSaving} onClick={remove}>
            {t('gigs.setlist.form.delete')}
          </Button>
          <Button kind="quiet" onClick={() => setAsks(null)}>
            {t('gigs.setlist.form.cancel')}
          </Button>
        </div>
      </Panel>

      <Panel
        open={asks === 'leave'}
        onClose={() => setAsks(null)}
        title={t('gigs.setlist.form.leaveTitle')}
      >
        <div className="gigs-sheet">
          <p className="textBody">{t('gigs.setlist.form.leaveLead')}</p>
          <Button kind="danger" onClick={() => navigate(back)}>
            {t('gigs.setlist.form.leave')}
          </Button>
          <Button kind="secondary" onClick={() => setAsks(null)}>
            {t('gigs.setlist.form.stay')}
          </Button>
        </div>
      </Panel>
    </AppLayout>
  );
}
