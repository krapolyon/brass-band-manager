import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { DropZone } from '../../components/DropZone.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { instrumentsOf, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { type Song, useSong } from '../../songs.ts';
import { AppLayout } from '../AppLayout.tsx';
import { FileLine } from './FileLine.tsx';
import {
  type DroppedFile,
  isPlaced,
  placeFiles,
  placeOf,
  proposedLength,
  type SendFailure,
  sendFiles,
  withDropped,
} from './files.ts';
import { day, duration, weight } from './format.ts';
import {
  checkDraft,
  draftOf,
  recordOf,
  type SongDraft,
  type SongErrors,
  SongFormFields,
} from './SongForm.tsx';
import { SpokenNamesCard } from './SpokenNames.tsx';
import './songs.css';

/** Why a file was not taken, in a few words. */
export function useRefusal() {
  const { t, i18n } = useTranslation();
  return ({ file, error, produced }: SendFailure) => {
    // A file the MuseScore file gave: the dropped file itself is saved.
    if (produced) return t(`songs.import.producedRefused.${produced}`, { file: file.file.name });
    const reason =
      error.error === 'fileTooBig' || error.error === 'bodyTooLarge'
        ? t('songs.import.reason.fileTooBig', { size: weight(file.file.size, i18n.language) })
        : error.error === 'invalidFile'
          ? t('songs.import.reason.invalidFile')
          : error.error === 'unreachable'
            ? t('songs.import.reason.unreachable')
            : t('songs.import.reason.other');
    return t('songs.import.refused', { file: file.file.name, reason });
  };
}

// Figma: Songs / Edit. The record of a song and its files, for whoever
// manages songs. The files come in through one drop zone: each replaces the
// one of the same role, and nothing changes before the form is saved
// (model/songs.md, "Import").
export function SongEditScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const songId = Number(useParams().id);
  const me = useMe().data;
  const song = useSong(songId);
  const instruments = instrumentsOf(useSections().data);
  const refusal = useRefusal();
  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [errors, setErrors] = useState<SongErrors>({});
  const [dropped, setDropped] = useState<DroppedFile[]>([]);
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [refused, setRefused] = useState<string[]>([]);
  const [isDeleting, setDeleting] = useState(false);

  // The form starts from the record as it is saved.
  useEffect(() => {
    if (song.data && draft === null) setDraft(draftOf(song.data));
  }, [song.data, draft]);

  const back = `/songs/${songId}`;
  if (me && !me.permissions.includes('manageSongs')) {
    return (
      <AppLayout
        current="songs"
        back={back}
        title={t('songs.edit.noRightTitle')}
        subtitle={t('songs.edit.noRight')}
        width="form"
        actions={
          <BottomBar>
            <Button onClick={() => navigate(back)}>{t('songs.edit.backToSong')}</Button>
          </BottomBar>
        }
      >
        {null}
      </AppLayout>
    );
  }

  const data = song.data;
  const pending = dropped.filter(isPlaced);
  const drop = async (files: File[]) => {
    try {
      const placed = await placeFiles(files);
      const next = withDropped(dropped, placed);
      setDropped(next);
      // A MIDI file among them proposes the length of the song, at the tempo
      // of the band; a length already there, saved or typed, stays.
      const bpm = Number(draft?.bpm) || data?.bpm || null;
      proposedLength(next, bpm).then((seconds) => {
        if (seconds === null) return;
        setDraft((current) =>
          current && !current.isDurationTyped
            ? { ...current, duration: duration(seconds) }
            : current,
        );
      });
      // A file that is not of a song, or a part whose instrument its name
      // does not tell: said at once, and not kept.
      setRefused(
        placed
          .filter((file) => !isPlaced(file))
          .map((file) =>
            t(file.role === null ? 'songs.import.ignoredFile' : 'songs.import.question', {
              file: file.file.name,
            }),
          ),
      );
    } catch {
      setState('failed');
    }
  };

  const labelOf = (file: DroppedFile) =>
    file.role === 'part'
      ? (instruments.find((instrument) => instrument.id === file.instrumentId)?.name ?? '')
      : file.role
        ? t(`songs.import.role.${file.role}`)
        : '';
  // Whether the song already has a file in the place a dropped one takes.
  const replaces = (file: DroppedFile, current: Song) => {
    if (file.role === 'part') {
      return current.parts.some((part) => part.instrumentId === file.instrumentId);
    }
    if (file.role === 'cover') return current.coverUrl !== null;
    return file.role !== null && current[file.role] !== null;
  };

  const save = async () => {
    if (!draft) return;
    const found = checkDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setState('saving');
    try {
      await api<Song>(`/api/songs/${songId}`, { method: 'PUT', body: recordOf(draft) });
      const { failures, scoreNotRead } = await sendFiles(songId, pending);
      await queryClient.invalidateQueries({ queryKey: ['songs'] });
      if (failures.length > 0 || scoreNotRead) {
        // The record is saved; what did not leave stays listed, with why.
        setDropped([
          ...new Set(failures.filter((failure) => !failure.produced).map(({ file }) => file)),
        ]);
        setRefused([
          ...(scoreNotRead ? [t('songs.import.scoreNotRead')] : []),
          ...new Set(failures.map(refusal)),
        ]);
        setState('idle');
        return;
      }
      navigate(back);
    } catch (error) {
      if (error instanceof ApiError && error.error === 'invalidInput') {
        setErrors(error.fields as SongErrors);
        setState('idle');
      } else {
        setState('failed');
      }
    }
  };

  const fileCount = data
    ? data.parts.length +
      [data.coverUrl, data.audio, data.midi, data.museScore].filter((file) => file !== null).length
    : 0;

  return (
    <>
      <AppLayout
        current="songs"
        back={back}
        backLabel={data?.name}
        title={t('songs.edit.title')}
        subtitle={data?.name}
        width="form"
        onSubmit={save}
        actions={
          <BottomBar
            surface="glass"
            caption={
              pending.length > 0 ? { kind: 'info', text: t('songs.edit.savedNote') } : undefined
            }
          >
            <Button type="submit" disabled={state === 'saving' || !draft}>
              {t('songs.edit.save')}
            </Button>
            <span className="songs-desktopOnly">
              <Button type="button" kind="secondary" onClick={() => navigate(back)}>
                {t('songs.edit.cancel')}
              </Button>
            </span>
          </BottomBar>
        }
      >
        {(song.isError || state === 'failed') && (
          <Message kind="danger">{t('errors.unreachable')}</Message>
        )}
        {song.isPending && <p role="status">{t('shell.loading')}</p>}
        {draft && data && (
          <>
            <SongFormFields
              draft={draft}
              onChange={setDraft}
              errors={errors}
              afterSong={<SpokenNamesCard songId={data.id} />}
              files={
                <Sheet title={t('songs.edit.files')}>
                  <p className="songs-muted">
                    {fileCount === 0
                      ? t('songs.edit.noFile')
                      : data.versionOn
                        ? t('songs.edit.filesInPlaceDated', {
                            count: fileCount,
                            date: day(data.versionOn, i18n.language, 'short').replace(/\.$/, ''),
                          })
                        : t('songs.edit.filesInPlace', { count: fileCount })}
                  </p>
                  <DropZone
                    size="compact"
                    title={t('songs.edit.dropTitle')}
                    hint={t('songs.edit.dropHint')}
                    buttonLabel={t('songs.edit.choose')}
                    onFiles={drop}
                    disabled={state === 'saving'}
                  />
                  {refused.map((text) => (
                    <Message key={text} kind="warning">
                      {text}
                    </Message>
                  ))}
                  {pending.length > 0 && (
                    <section className="songs-panelGroup">
                      <h3 className="textCaption songs-muted">
                        {t(
                          pending.some((file) => replaces(file, data))
                            ? 'songs.edit.pending'
                            : 'songs.edit.pendingNew',
                        )}
                      </h3>
                      <ul className="songs-rows">
                        {pending.map((file) => (
                          <li key={file.key}>
                            <FileLine
                              label={labelOf(file)}
                              fileName={t(
                                replaces(file, data) ? 'songs.edit.replaces' : 'songs.edit.adds',
                                { file: file.file.name },
                              )}
                              action={{
                                icon: 'Undo',
                                label: t('songs.edit.undo', { file: file.file.name }),
                                onPress: () =>
                                  setDropped((current) =>
                                    current.filter((other) => placeOf(other) !== placeOf(file)),
                                  ),
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </Sheet>
              }
            />

            <div className="songs-delete">
              <Button
                type="button"
                kind="quiet"
                icon="Trash"
                data-tone="danger"
                aria-haspopup="dialog"
                onClick={() => setDeleting(true)}
              >
                {t('songs.edit.delete')}
              </Button>
              <p className="songs-muted textCaption">{t('songs.edit.deleteNote')}</p>
            </div>
          </>
        )}
      </AppLayout>

      {data && (
        <DeletePanel
          open={isDeleting}
          onClose={() => setDeleting(false)}
          song={data}
          onGone={() => navigate('/songs')}
          onAbandoned={() => navigate(back)}
        />
      )}
    </>
  );
}

type DeleteProps = {
  open: boolean;
  onClose: () => void;
  song: Song;
  onGone: () => void;
  onAbandoned: () => void;
};

// Figma: Songs / Delete song — confirm. Deleting asks first: what goes with
// the song, that it cannot be undone, and the gentler way.
function DeletePanel({ open, onClose, song, onGone, onAbandoned }: DeleteProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');

  const act = async (action: 'delete' | 'abandon') => {
    setState('working');
    try {
      if (action === 'delete') {
        await api(`/api/songs/${song.id}`, { method: 'DELETE' });
        queryClient.removeQueries({ queryKey: ['songs', song.id] });
      } else {
        await api<Song>(`/api/songs/${song.id}/status`, {
          method: 'PUT',
          body: { status: 'ABANDONED' },
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['songs'] });
      setState('idle');
      (action === 'delete' ? onGone : onAbandoned)();
    } catch {
      setState('failed');
    }
  };

  return (
    <Panel open={open} onClose={onClose} title={t('songs.delete.title', { name: song.name })}>
      <div className="songs-panel">
        {state === 'failed' && <Message kind="danger">{t('errors.unreachable')}</Message>}
        <p>{t('songs.delete.text')}</p>
        <p className="songs-muted">{t('songs.delete.alternative')}</p>
        <div className="songs-panelActions">
          <Button
            kind="danger"
            icon="Trash"
            disabled={state === 'working'}
            onClick={() => act('delete')}
          >
            {t('songs.delete.confirm')}
          </Button>
          <Button kind="secondary" disabled={state === 'working'} onClick={() => act('abandon')}>
            {t('songs.delete.abandon')}
          </Button>
          <span className="songs-belowDesktop">
            <Button kind="quiet" onClick={onClose}>
              {t('songs.delete.cancel')}
            </Button>
          </span>
        </div>
      </div>
    </Panel>
  );
}
