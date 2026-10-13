import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextField } from '../../components/TextField.tsx';
import { useSongs } from '../../songs.ts';

// A phrase the dictation of a setlist learned for a song, as
// GET /api/songs/{id}/spokenNames answers it (api/src/Songs/SpokenNames.php).
type SpokenName = { id: number; phrase: string };

// model/songs.md, field `songSpokenName.phrase`. The server judges the phrase
// once cleaned; this only stops the typing.
const PHRASE_MAX_LENGTH = 60;

// Figma: Songs / Edit — the dictation card, and the sheet "Façons de le dire"
// (section 7). What the dictation of a setlist recognises for this song,
// besides its name (model/songs.md, entry 4). The sheet saves at once, like
// the known spellings, not with the form. For whoever manages songs.
export function SpokenNamesCard({ songId }: { songId: number }) {
  const { t } = useTranslation();
  const queryKey = ['songs', songId, 'spokenNames'];
  const phrases = useQuery({
    queryKey,
    queryFn: () => api<SpokenName[]>(`/api/songs/${songId}/spokenNames`),
  });
  const [isOpen, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const all = phrases.data ?? [];

  return (
    <>
      <Sheet title={t('songs.spokenNames.title')}>
        <p className="songs-muted textBody">{t('songs.spokenNames.lead')}</p>
        <ListRow
          label={t('songs.spokenNames.ways')}
          // As stored, comma separated; nothing when the song has none yet.
          detail={all.map(({ phrase }) => phrase).join(', ') || undefined}
          trailing={
            <IconButton
              icon="Pencil"
              label={t('songs.spokenNames.edit')}
              aria-haspopup="dialog"
              onClick={() => {
                // The sheet starts closed on its field each time it opens.
                setKey(key + 1);
                setOpen(true);
              }}
            />
          }
        />
      </Sheet>

      <Panel open={isOpen} onClose={() => setOpen(false)} title={t('songs.spokenNames.ways')}>
        <Phrases key={key} songId={songId} phrases={all} queryKey={queryKey} />
      </Panel>
    </>
  );
}

// Each phrase with its deletion, then the line that adds one: a phrase is not
// edited, it is deleted and added again. A phrase another song has is moved
// only once the member said so.
function Phrases({
  songId,
  phrases,
  queryKey,
}: {
  songId: number;
  phrases: SpokenName[];
  queryKey: unknown[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const songs = useSongs().data ?? [];
  const [isAdding, setAdding] = useState(false);
  const [phrase, setPhrase] = useState('');
  const content = useRef<HTMLDivElement>(null);
  // After a deletion, the place in the list of the phrase that went.
  const deletedAt = useRef<number | null>(null);

  const keep = (changed: SpokenName[]) => {
    queryClient.setQueryData(queryKey, changed);
    // The dictation reads them from its own address.
    queryClient.invalidateQueries({ queryKey: ['spokenNames'] });
  };
  const focusAdding = () =>
    content.current?.querySelector<HTMLElement>('input, button[data-add]')?.focus();

  const add = useMutation({
    mutationFn: (asked: { phrase: string; moves: boolean }) =>
      api<SpokenName[]>(`/api/songs/${songId}/spokenNames`, { method: 'POST', body: asked }),
    onSuccess: (changed) => {
      keep(changed);
      // Ready for the next one, the focus back in the field.
      setPhrase('');
      focusAdding();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      api<SpokenName[]>(`/api/songSpokenNames/${id}`, { method: 'DELETE' }),
    onSuccess: keep,
    onError: () => {
      deletedAt.current = null;
    },
  });

  // The field takes the focus when it appears.
  useEffect(() => {
    if (isAdding) content.current?.querySelector('input')?.focus();
  }, [isAdding]);

  // The button of a deleted phrase is gone with its row: the focus goes to
  // the phrase that took its place, to the last one, or to the line that adds.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the list of phrases changes
  useEffect(() => {
    if (deletedAt.current === null) return;
    const buttons = content.current?.querySelectorAll<HTMLElement>('[data-delete]') ?? [];
    const next = buttons[Math.min(deletedAt.current, buttons.length - 1)];
    deletedAt.current = null;
    if (next) next.focus();
    else focusAdding();
  }, [phrases]);

  const refused = add.error instanceof ApiError ? add.error.fields : {};
  const takenBy =
    refused.phrase === 'phraseTaken'
      ? songs.find((other) => String(other.id) === refused.takenBySongId)?.name
      : undefined;
  const problem =
    refused.phrase === 'required' || refused.phrase === 'tooShort' || refused.phrase === 'tooLong'
      ? t(`songs.spokenNames.${refused.phrase}`)
      : undefined;

  // Not a <form>: the sheet lives inside the form of the song, which it must not send.
  const send = () => {
    if (phrase.trim() === '' || add.isPending || add.isError) return;
    add.mutate({ phrase, moves: false });
  };

  return (
    <div className="songs-spokenNames" ref={content}>
      {((add.isError && !problem && !takenBy) || remove.isError) && (
        <Message kind="danger">{t('errors.unreachable')}</Message>
      )}
      <div>
        {phrases.map(({ id, phrase: known }, index) => (
          <ListRow
            key={id}
            label={known}
            trailing={
              <IconButton
                icon="Trash"
                label={t('songs.spokenNames.delete', { phrase: known })}
                data-delete
                onClick={() => {
                  if (remove.isPending) return;
                  deletedAt.current = index;
                  remove.mutate(id);
                }}
              />
            }
          />
        ))}
        {!isAdding && (
          <ListRow add label={t('songs.spokenNames.add')} onPress={() => setAdding(true)} />
        )}
      </div>
      {isAdding && (
        <div className="songs-spokenNames">
          <TextField
            label={t('songs.spokenNames.label')}
            error={problem}
            name="phrase"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={PHRASE_MAX_LENGTH}
            value={phrase}
            enterKeyHint="done"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              send();
            }}
            onChange={(event) => {
              setPhrase(event.target.value);
              // What was refused is no longer what is typed.
              if (add.isError) add.reset();
            }}
          />
          {takenBy ? (
            <>
              <Message kind="warning">{t('songs.spokenNames.taken', { name: takenBy })}</Message>
              <Button
                kind="secondary"
                disabled={add.isPending}
                onClick={() => add.mutate({ phrase, moves: true })}
              >
                {t('songs.spokenNames.move')}
              </Button>
            </>
          ) : (
            <Button disabled={phrase.trim() === '' || add.isPending || add.isError} onClick={send}>
              {t('songs.spokenNames.confirm')}
            </Button>
          )}
        </div>
      )}
      <p className="songs-muted textCaption">{t('songs.spokenNames.note')}</p>
    </div>
  );
}
