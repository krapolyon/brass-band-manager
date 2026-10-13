import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { SortableHandle, SortableList, useSortableRow } from '../../components/Sortable.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { type Gig, useGig } from '../../gigs.ts';
import { useMe } from '../../session.ts';
import { type SongSummary, useSongs } from '../../songs.ts';
import { AppLayout } from '../AppLayout.tsx';
import { useLeaveGuard } from '../LeaveGuard.tsx';
import { recogniseAny, type Spoken } from './dictation.ts';
import { useDictation } from './useDictation.ts';
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
// saved together by the button; leaving with changes asks first. The songs
// can also be dictated, one by one: what is heard is matched with the songs
// the band plays, and the app learns from the choices (model/songs.md, entry
// 4). For who manages setlists.
export function SetlistFormScreen() {
  const { t, i18n } = useTranslation();
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
  const [asks, setAsks] = useState<'delete' | null>(null);
  const [failure, setFailure] = useState<'failed' | 'tooLong' | null>(null);
  const [isSaving, setSaving] = useState(false);
  const canManage = me?.permissions.includes('manageSetlists') ?? false;

  // The dictation: what it knows of the songs, what it last heard, and the
  // choice it waits for.
  const spokenNames = useQuery({
    queryKey: ['spokenNames'],
    queryFn: () => api<{ songId: number; phrases: string[] }[]>('/api/spokenNames'),
    enabled: canManage,
  });
  const [heard, setHeard] = useState<{ said: string; name?: string } | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ said: string; phrase: string; songIds: number[] } | null>(
    null,
  );
  // The line the dictation just added, and the phrase of one just removed:
  // replacing it at once by another song teaches that song the phrase.
  const dictated = useRef<{ key: string; phrase: string } | null>(null);
  const correcting = useRef<string | null>(null);
  const onHeard = useRef<(wordings: string[]) => void>(() => {});
  const dictation = useDictation(i18n.language, (wordings) => onHeard.current(wordings));

  const gig = gigQuery.data;
  // Leaving with changes asks first, by the cross as by the back button of the browser.
  const isDirty = draft !== null && JSON.stringify(record(draft)) !== initial.current;
  const guard = useLeaveGuard(isDirty, t('gigs.setlist.form.leaveLead'));
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

  const playable = songs.filter(
    (song) => song.status === 'IN_REPERTOIRE' || song.status === 'TEMPORARY',
  );
  // Saves a phrase heard for the song the member chose or corrected. A comfort:
  // when it fails, the setlist is written all the same.
  const learn = (songId: number, phrase: string) => {
    api<{ songId: number; phrases: string[] }[]>(`/api/songs/${songId}/spokenNames/learned`, {
      method: 'POST',
      body: { phrase },
    })
      .then((known) => queryClient.setQueryData(['spokenNames'], known))
      .catch(() => {});
  };
  const add = (song: SongSummary, dictatedPhrase?: string) => {
    const line = { key: newKey(), songId: song.id, name: song.name };
    const lines = [...draft.lines, line];
    setDraft({ ...draft, lines });
    setQuery('');
    setSaid(t('gigs.setlist.form.added', { name: song.name, position: lines.length }));
    if (dictatedPhrase === undefined) {
      // Typed right after the song the dictation added was removed: a correction.
      if (correcting.current) learn(song.id, correcting.current);
      dictated.current = null;
    } else {
      dictated.current = { key: line.key, phrase: dictatedPhrase };
    }
    correcting.current = null;
    readyForNext();
  };
  onHeard.current = (wordings) => {
    const known = new Map((spokenNames.data ?? []).map((one) => [one.songId, one.phrases]));
    const candidates: Spoken[] = playable.map((song) => ({
      songId: song.id,
      name: song.name,
      phrases: known.get(song.id) ?? [],
    }));
    const result = recogniseAny(wordings, candidates);
    setUnknown(null);
    setChoice(null);
    if (result.kind === 'one') {
      const song = playable.find((one) => one.id === result.songId);
      if (!song) return;
      setHeard({ said: result.phrase, name: song.name });
      add(song, result.phrase);
    } else if (result.kind === 'several') {
      setHeard({ said: result.phrase });
      setChoice({ said: result.phrase, phrase: result.phrase, songIds: result.songIds });
    } else {
      setHeard(null);
      setUnknown(result.said);
    }
  };
  const choose = (song: SongSummary) => {
    if (!choice) return;
    learn(song.id, choice.phrase);
    setHeard({ said: choice.said, name: song.name });
    setChoice(null);
    add(song, choice.phrase);
    // Chosen, not guessed: there is nothing to correct after it.
    dictated.current = null;
  };
  // The field that adds a song keeps the focus: it is ready for the next one.
  const readyForNext = () =>
    window.requestAnimationFrame(() =>
      form.current?.querySelector<HTMLInputElement>('.gigs-addSong input')?.focus(),
    );
  const moveTo = (line: Line, to: number) => {
    const from = draft.lines.indexOf(line);
    if (from < 0 || to < 0 || to >= draft.lines.length || to === from) return;
    const lines = [...draft.lines];
    lines.splice(to, 0, ...lines.splice(from, 1));
    setDraft({ ...draft, lines });
    setSaid(t('gigs.setlist.form.moved', { name: line.name, position: to + 1 }));
  };
  const move = (line: Line, by: 1 | -1) => moveTo(line, draft.lines.indexOf(line) + by);

  const save = async () => {
    setSaving(true);
    setFailure(null);
    try {
      const saved = await api<Gig>(
        existing ? `/api/setlists/${existing.id}` : `/api/gigs/${gigId}/setlists`,
        { method: existing ? 'PUT' : 'POST', body: record(draft) },
      );
      queryClient.setQueryData(['gig', gigId], saved);
      guard.letGo();
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
      guard.letGo();
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
            <p className="gigs-muted textCaption">
              {t(
                dictation.isSupported
                  ? 'gigs.setlist.form.noSongOrDictate'
                  : 'gigs.setlist.form.noSong',
              )}
            </p>
          ) : (
            <SortableList
              ids={draft.lines.map((line) => line.key)}
              onMove={(from, to) => moveTo(draft.lines[from] as Line, to)}
            >
              <ol>
                {draft.lines.map((line, index) => (
                  <SongLine
                    key={line.key}
                    line={line}
                    position={index + 1}
                    onMore={() => setOpenLine(line)}
                  />
                ))}
              </ol>
            </SortableList>
          )}
        </section>

        {dictation.isListening ? (
          <>
            <section className="gigs-dictation" aria-labelledby="gigs-listening">
              <div className="gigs-dictationHeading">
                <span className="gigs-dictationMicrophone">
                  <Icon name="Microphone" filled />
                </span>
                <h2 className="textHeading" id="gigs-listening">
                  {t('gigs.setlist.form.dictation.listening')}
                </h2>
                <Button kind="secondary" size="small" onClick={dictation.stop}>
                  {t('gigs.setlist.form.dictation.stop')}
                </Button>
              </div>
              <p className="gigs-muted textBody">{t('gigs.setlist.form.dictation.lead')}</p>
              <p className="gigs-dictationHeard textCaption" aria-live="polite">
                {heard &&
                  (heard.name
                    ? t('gigs.setlist.form.dictation.heard', {
                        heard: heard.said,
                        name: heard.name,
                      })
                    : t('gigs.setlist.form.dictation.heardOnly', { heard: heard.said }))}
              </p>
            </section>
            {unknown !== null && (
              <Message kind="warning">
                {t('gigs.setlist.form.dictation.unknown', { heard: unknown })}
              </Message>
            )}
            {choice && (
              <section className="gigs-dictation" aria-labelledby="gigs-which">
                <h2 className="textHeading" id="gigs-which">
                  {t('gigs.setlist.form.dictation.which', { heard: choice.said })}
                </h2>
                <p className="gigs-muted textBody">{t('gigs.setlist.form.dictation.whichLead')}</p>
                <div className="gigs-dictationChoices">
                  {choice.songIds.map((songId) => {
                    const song = playable.find((one) => one.id === songId);
                    return (
                      song && (
                        <Button
                          key={songId}
                          kind="secondary"
                          size="small"
                          icon="Plus"
                          aria-label={t('gigs.setlist.form.dictation.choose', { name: song.name })}
                          onClick={() => choose(song)}
                        >
                          {song.name}
                        </Button>
                      )
                    );
                  })}
                  <Button
                    kind="quiet"
                    size="small"
                    onClick={() => {
                      setChoice(null);
                      setHeard(null);
                    }}
                  >
                    {t('gigs.setlist.form.dictation.neither')}
                  </Button>
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            {dictation.problem && (
              <Message kind="warning">
                {t(`gigs.setlist.form.dictation.${dictation.problem}`)}
              </Message>
            )}
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
              {dictation.isSupported && (
                <IconButton
                  kind="control"
                  icon="Microphone"
                  label={t('gigs.setlist.form.dictation.start')}
                  onClick={() => {
                    setHeard(null);
                    setUnknown(null);
                    setChoice(null);
                    dictation.start();
                  }}
                />
              )}
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
            <p className="gigs-muted textCaption">{t('gigs.setlist.form.help')}</p>
          </>
        )}
        <p className="visuallyHidden" role="status">
          {said}
        </p>
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
            <p className="textBody">{t('gigs.setlist.form.dragHint')}</p>
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
                // The song the dictation just added: what replaces it is what was said.
                correcting.current =
                  dictated.current?.key === openLine.key ? dictated.current.phrase : null;
                dictated.current = null;
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

      {guard.panel}
    </AppLayout>
  );
}

/** A song of the form: its "more" button, and the handle it is dragged by. */
function SongLine({
  line,
  position,
  onMore,
}: {
  line: Line;
  position: number;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  const sortable = useSortableRow(line.key);

  return (
    <SetlistSongRow mode="edit" position={position} name={line.name} row={sortable.row}>
      <IconButton
        icon="More"
        label={t('gigs.setlist.form.more', { name: line.name })}
        aria-haspopup="dialog"
        onClick={onMore}
      />
      <SortableHandle {...sortable.handle} />
    </SetlistSongRow>
  );
}
