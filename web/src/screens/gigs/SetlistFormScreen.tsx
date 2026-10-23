import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { keepAboveKeyboard } from '../../aboveKeyboard.ts';
import { ApiError, api } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { PlayedDots } from '../../components/PlayedDots.tsx';
import { SetlistLength } from '../../components/SetlistLength.tsx';
import { SetlistSongRow } from '../../components/SetlistSongRow.tsx';
import { SongPickerRow } from '../../components/SongPickerRow.tsx';
import { SortableHandle, SortableList, useSortableRow } from '../../components/Sortable.tsx';
import { Stepper } from '../../components/Stepper.tsx';
import { SwitchRow } from '../../components/SwitchRow.tsx';
import { TextArea } from '../../components/TextArea.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { type Gig, useGig } from '../../gigs.ts';
import { useMe } from '../../session.ts';
import { type SongSummary, useSongs } from '../../songs.ts';
import { AppLayout } from '../AppLayout.tsx';
import { useLeaveGuard } from '../LeaveGuard.tsx';
import { recogniseAny, type Spoken } from './dictation.ts';
import { candidatesOf, isNew, lengthOf, type Proposal, propose, type Rule } from './generator.ts';
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
// 4). And they can be picked from the list of every song the band plays,
// which stays open: each tap appends a song (Gigs › 18, issue #20). Plain
// dots tell how often a song is already played at this gig. The handle moves
// a song, a swipe to the left removes it (SetlistSongRow). For who manages
// setlists.
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
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [asks, setAsks] = useState<'delete' | null>(null);
  const [failure, setFailure] = useState<'failed' | 'tooLong' | null>(null);
  const [isSaving, setSaving] = useState(false);
  const canManage = me?.permissions.includes('manageSetlists') ?? false;
  // "Proposer des morceaux" (Gigs › 19, issue #25): its sheet, its two
  // choices, and the proposal the editor holds until it is changed by hand.
  const [isProposing, setProposing] = useState(false);
  const [proposedCount, setProposedCount] = useState(10);
  const [includesNew, setIncludesNew] = useState(false);
  const [proposal, setProposal] = useState<(Proposal & { first: string; last: string }) | null>(
    null,
  );

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
  const dictation = useDictation(t('gigs.setlist.form.dictation.language'), (wordings) =>
    onHeard.current(wordings),
  );

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

  // On a phone, the field of the songs goes to the top of what the keyboard
  // leaves visible, with room under it for the suggestions (#19).
  const [keyboardRoom, setKeyboardRoom] = useState(0);
  const leaveKeyboard = useRef<() => void>(() => {});
  useEffect(() => () => leaveKeyboard.current(), []);

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
  // How many times a song is in the other setlists of the gig, all slots and
  // days together (model/gigs.md, "Played dots"), from what the API answers.
  const elsewhere = new Map<number, number>();
  for (const setlist of gig.setlists) {
    if (setlist.id === existing?.id) continue;
    for (const song of setlist.songs)
      elsewhere.set(song.songId, (elsewhere.get(song.songId) ?? 0) + 1);
  }
  const playedElsewhere = (songId: number) => elsewhere.get(songId) ?? 0;

  // What the generator reads: the songs the editor already has. "Today" by
  // the clock of the device, as for the other dates of a gig.
  const today = new Date().toLocaleDateString('sv');
  const newSongs = candidatesOf(songs, true, today).filter((song) => isNew(song, today));
  const candidates = candidatesOf(songs, includesNew, today);
  const known = candidates.flatMap((song) => (song.durationSeconds ? [song.durationSeconds] : []));
  const averageLength =
    known.length > 0 ? known.reduce((sum, one) => sum + one, 0) / known.length : null;
  const proposedMinutes =
    averageLength === null
      ? null
      : Math.round(
          (averageLength * proposedCount + gig.setlistGapSeconds * (proposedCount - 1)) / 60,
        );
  const isProposalShown =
    proposal !== null &&
    JSON.stringify(proposal.songIds) === JSON.stringify(draft.lines.map((line) => line.songId));
  const draw = () => {
    const drawn = propose({
      songs,
      count: proposedCount,
      includeNew: includesNew,
      avoid: [...elsewhere.keys()],
      today,
      random: Math.random,
    });
    const byId = new Map(songs.map((song) => [song.id, song]));
    const lines = drawn.songIds.flatMap((songId) => {
      const song = byId.get(songId);
      return song ? [{ key: newKey(), songId, name: song.name }] : [];
    });
    setDraft({ ...draft, lines });
    setProposal({
      ...drawn,
      first: lines[0]?.name ?? '',
      last: lines.at(-1)?.name ?? '',
    });
    setProposing(false);
    setSaid(t('gigs.setlist.form.propose.done', { count: lines.length }));
  };
  const lengthNow = lengthOf(
    draft.lines.map(
      (line) => songs.find((song) => song.id === line.songId)?.durationSeconds ?? null,
    ),
    gig.setlistGapSeconds,
  );
  const ruleNames = (dropped: Rule[]) =>
    new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
      dropped.map((rule) => t(`gigs.setlist.form.propose.rules.${rule}`)),
    );
  const inThis = (songId: number) => draft.lines.filter((line) => line.songId === songId).length;
  // The list of every song, from A to Z, narrowed by its search.
  const searched = plain(search);
  const listed = playable
    .filter(
      (song) =>
        searched === '' || `${plain(song.name)} ${plain(song.originalTitle)}`.includes(searched),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
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
  const add = (song: SongSummary, dictatedPhrase?: string, fromList = false) => {
    const line = { key: newKey(), songId: song.id, name: song.name };
    const lines = [...draft.lines, line];
    setDraft({ ...draft, lines });
    setSaid(t('gigs.setlist.form.added', { name: song.name, position: lines.length }));
    // From the list: it stays open, and keeps the focus on the song tapped.
    if (fromList) {
      dictated.current = null;
      correcting.current = null;
      return;
    }
    setQuery('');
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
  // Unless the focus went somewhere else in the meantime (a row reached from
  // the keyboard): it is not taken back from there.
  const readyForNext = () => {
    const before = document.activeElement;
    window.requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now !== before && now !== document.body) return;
      form.current?.querySelector<HTMLInputElement>('.gigs-addSong input')?.focus();
    });
  };
  const moveTo = (line: Line, to: number) => {
    const from = draft.lines.indexOf(line);
    if (from < 0 || to < 0 || to >= draft.lines.length || to === from) return;
    const lines = [...draft.lines];
    lines.splice(to, 0, ...lines.splice(from, 1));
    setDraft({ ...draft, lines });
    setSaid(t('gigs.setlist.form.moved', { name: line.name, position: to + 1 }));
  };
  const move = (line: Line, by: 1 | -1) => {
    moveTo(line, draft.lines.indexOf(line) + by);
    // The row keeps the focus at its new place.
    window.requestAnimationFrame(() =>
      form.current?.querySelector<HTMLElement>(`[data-line="${line.key}"]`)?.focus(),
    );
  };
  const removeLine = (line: Line) => {
    const index = draft.lines.indexOf(line);
    const lines = draft.lines.filter((other) => other !== line);
    setDraft({ ...draft, lines });
    // The song the dictation just added: what replaces it is what was said.
    correcting.current = dictated.current?.key === line.key ? dictated.current.phrase : null;
    dictated.current = null;
    setSaid(t('gigs.setlist.form.removed', { name: line.name }));
    // Its row is gone: the focus goes to the row that took its place, or to
    // the field that adds a song.
    const next = lines[Math.min(index, lines.length - 1)];
    window.requestAnimationFrame(() => {
      const row = next && form.current?.querySelector<HTMLElement>(`[data-line="${next.key}"]`);
      if (row) row.focus();
      else readyForNext();
    });
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
        <TextArea
          label={t('gigs.setlist.form.description')}
          lines={2}
          error={
            failure === 'tooLong' ? t('gigs.setlist.form.errors.description.tooLong') : undefined
          }
          value={draft.description}
          maxLength={120}
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
                    played={playedElsewhere(line.songId)}
                    onRemove={() => removeLine(line)}
                    onMove={(by) => move(line, by)}
                  />
                ))}
              </ol>
            </SortableList>
          )}
          {draft.lines.length > 0 && (
            <SetlistLength
              length={t('gigs.setlist.form.length', {
                count: draft.lines.length,
                minutes: lengthNow.minutes,
              })}
              note={
                lengthNow.withoutLength > 0
                  ? t('gigs.setlist.form.withoutLength', { count: lengthNow.withoutLength })
                  : draft.lines.length > 1
                    ? t('gigs.setlist.form.withGap', { gap: gig.setlistGapSeconds })
                    : undefined
              }
            />
          )}
        </section>
        {isProposalShown && proposal && (
          <>
            <Message>
              {[
                t('gigs.setlist.form.propose.made', {
                  first: proposal.first,
                  last: proposal.last,
                }),
                proposal.dropped.length > 0 &&
                  t('gigs.setlist.form.propose.dropped', { rules: ruleNames(proposal.dropped) }),
                proposal.isShort &&
                  t('gigs.setlist.form.propose.short', { count: proposal.songIds.length }),
              ]
                .filter(Boolean)
                .join(' ')}
            </Message>
            <Button kind="secondary" icon="RotateCw" onClick={draw}>
              {t('gigs.setlist.form.propose.again')}
            </Button>
          </>
        )}

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
                onFocus={(event) => {
                  leaveKeyboard.current();
                  leaveKeyboard.current = keepAboveKeyboard(event.currentTarget, setKeyboardRoom);
                }}
                onBlur={() => {
                  leaveKeyboard.current();
                  leaveKeyboard.current = () => {};
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
              <IconButton
                kind="control"
                icon="List"
                label={t('gigs.setlist.form.list.open')}
                aria-haspopup="dialog"
                onClick={() => {
                  setSearch('');
                  setPickerOpen(true);
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
                  const played = playedElsewhere(song.id);
                  return (
                    <li key={song.id}>
                      <button
                        type="button"
                        className="textBodyLarge"
                        data-first={index === 0}
                        aria-label={[
                          t('gigs.setlist.form.suggestion', { name: label }),
                          played > 0 && t('gigs.setlist.form.playedElsewhere', { count: played }),
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        // The field keeps the focus while a suggestion is
                        // pressed: on a phone the keyboard stays up, and
                        // nothing moves under the finger.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => add(song)}
                      >
                        <Icon name="Plus" />
                        <span className="gigs-suggestionName">{label}</span>
                        <PlayedDots count={played} />
                      </button>
                    </li>
                  );
                })}
                {suggestions.length === 0 && (
                  <li className="gigs-muted textCaption">{t('gigs.setlist.form.noMatch')}</li>
                )}
              </ul>
            )}
            {!isProposalShown && (
              <Button
                kind="secondary"
                icon="Lightbulb"
                aria-haspopup="dialog"
                onClick={() => setProposing(true)}
              >
                {t('gigs.setlist.form.propose.open')}
              </Button>
            )}
            <p className="gigs-muted textCaption">{t('gigs.setlist.form.help')}</p>
            {/* Under the keyboard, never seen: the page is long enough for the
                field to reach the top of what is visible. */}
            {keyboardRoom > 0 && <div aria-hidden="true" style={{ height: keyboardRoom }} />}
          </>
        )}
        <p className="visuallyHidden" role="status">
          {said}
        </p>
      </div>

      {/* Every song a setlist can hold: a tap appends it, the list stays open. */}
      <Panel
        open={isPickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('gigs.setlist.form.list.title')}
      >
        <div className="gigs-picker">
          <TextField
            label={t('gigs.setlist.form.list.search')}
            type="search"
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {listed.length === 0 ? (
            <p className="gigs-muted textBody" role="status">
              {searched === ''
                ? t('gigs.setlist.form.list.empty')
                : t('gigs.setlist.form.list.nothing', { search: search.trim() })}
            </p>
          ) : (
            <ul className="gigs-pickerSongs" aria-label={t('gigs.setlist.form.list.title')}>
              {listed.map((song) => {
                const count = inThis(song.id);
                return (
                  <SongPickerRow
                    key={song.id}
                    name={song.name}
                    inSetlist={count > 0}
                    played={playedElsewhere(song.id) + count}
                    label={t(
                      count > 0 ? 'gigs.setlist.form.list.addAgain' : 'gigs.setlist.form.list.add',
                      {
                        name: song.name,
                        count: playedElsewhere(song.id) + count,
                      },
                    )}
                    onPick={() => add(song, undefined, true)}
                  />
                );
              })}
            </ul>
          )}
          {/* Said here too: a modal panel hides what is outside it. */}
          <p className="visuallyHidden" role="status">
            {isPickerOpen ? said : ''}
          </p>
        </div>
      </Panel>

      {/* A BottomSheet below 1024, a Dialog from 1024 (Gigs › 19, 20). */}
      <Panel
        open={isProposing}
        onClose={() => setProposing(false)}
        title={t('gigs.setlist.form.propose.title')}
      >
        <div className="gigs-sheet">
          <p className="textBodyStrong" id="gigs-propose-count">
            {t('gigs.setlist.form.propose.howMany')}
          </p>
          <Stepper
            label={t('gigs.setlist.form.propose.howMany')}
            value={proposedCount}
            min={3}
            max={30}
            onChange={setProposedCount}
          />
          {proposedMinutes !== null && (
            <p className="gigs-muted textCaption">
              {t('gigs.setlist.form.propose.about', {
                minutes: proposedMinutes,
                gap: gig.setlistGapSeconds,
              })}
            </p>
          )}
          {newSongs.length > 0 && (
            <SwitchRow
              label={t('gigs.setlist.form.propose.includeNew')}
              description={t('gigs.setlist.form.propose.includeNewHint', {
                names: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
                  newSongs.map((song) => song.name),
                ),
              })}
              checked={includesNew}
              onChange={setIncludesNew}
            />
          )}
          {draft.lines.length > 0 && (
            <Message>
              {t('gigs.setlist.form.propose.replaces', { count: draft.lines.length })}
            </Message>
          )}
          <Button onClick={draw}>
            {t('gigs.setlist.form.propose.go', { count: proposedCount })}
          </Button>
        </div>
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

/** A song of the form: the handle it is dragged by; swiped or from the keyboard, it is removed or moved. */
function SongLine({
  line,
  position,
  played,
  onRemove,
  onMove,
}: {
  line: Line;
  position: number;
  played: number;
  onRemove: () => void;
  onMove: (by: 1 | -1) => void;
}) {
  const { t } = useTranslation();
  const sortable = useSortableRow(line.key);

  return (
    <SetlistSongRow
      mode="edit"
      position={position}
      name={line.name}
      played={played}
      playedLabel={t('gigs.setlist.form.playedElsewhere', { count: played })}
      row={{ ...sortable.row, 'data-line': line.key } as typeof sortable.row}
      onRemove={onRemove}
      onMove={onMove}
      keysLabel={t('gigs.setlist.form.rowKeys')}
      removeLabel={t('gigs.setlist.form.remove')}
      removeName={t('gigs.setlist.form.removeSong', { name: line.name })}
    >
      <SortableHandle {...sortable.handle} />
    </SetlistSongRow>
  );
}
