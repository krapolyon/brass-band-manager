import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { DropZone } from '../../components/DropZone.tsx';
import { Gauge } from '../../components/Gauge.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { StepIndicator } from '../../components/StepIndicator.tsx';
import { SelectField } from '../../components/TextField.tsx';
import { instrumentsOf, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import type { Song } from '../../songs.ts';
import { AppLayout } from '../AppLayout.tsx';
import { useIsDesktop } from './device.ts';
import { FileLine } from './FileLine.tsx';
import {
  type DroppedFile,
  isIgnored,
  isPlaced,
  isQuestion,
  placeFiles,
  sendFiles,
  withDropped,
} from './files.ts';
import { today } from './format.ts';
import { useRefusal } from './SongEditScreen.tsx';
import {
  checkDraft,
  draftOf,
  recordOf,
  type SongDraft,
  type SongErrors,
  SongFormFields,
} from './SongForm.tsx';
import './songs.css';

// Figma: Songs / Import, steps 1 and 2. Whoever manages songs drops the
// files of a new song together; the app says where each one goes, asks what
// it cannot tell, then shows the record of the song. Nothing is saved before
// the last button (model/songs.md, "Import").
//
// The two steps are one screen: going back to the first keeps what was done.
export function ImportScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const isDesktop = useIsDesktop();
  const instruments = instrumentsOf(useSections().data);
  const refusal = useRefusal();
  const [step, setStep] = useState<1 | 2>(1);
  const [dropped, setDropped] = useState<DroppedFile[]>([]);
  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [errors, setErrors] = useState<SongErrors>({});
  const [correcting, setCorrecting] = useState<DroppedFile | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  // Once the song exists: the files that did not leave, and why.
  const [created, setCreated] = useState<{ songId: number; refused: string[] } | null>(null);

  // A step that changes takes the member back to its top, and says so to a
  // screen reader: the title of the page receives the focus.
  const isFirstStep = useRef(true);
  useEffect(() => {
    // Not when the screen opens: only when the step changes.
    if (isFirstStep.current && step === 1) {
      isFirstStep.current = false;
      return;
    }
    isFirstStep.current = false;
    window.scrollTo(0, 0);
    const title = document.querySelector<HTMLElement>('.ScreenTop h1');
    title?.setAttribute('tabindex', '-1');
    title?.focus();
  }, [step]);

  if (me && !me.permissions.includes('manageSongs')) return <Navigate to="/songs" replace />;

  const placed = dropped.filter(isPlaced);
  const questions = dropped.filter(isQuestion);
  const ignored = dropped.filter(isIgnored);
  const instrumentName = (id: number | null) =>
    instruments.find((instrument) => instrument.id === id)?.name ?? '';
  const labelOf = (file: DroppedFile) =>
    file.role === 'part'
      ? instrumentName(file.instrumentId)
      : file.role
        ? t(`songs.import.role.${file.role}`)
        : '';

  const drop = async (files: File[]) => {
    try {
      const added = await placeFiles(files);
      setDropped((current) => withDropped(current, added));
      setState('idle');
    } catch {
      setState('failed');
    }
  };
  // Gives a part its instrument: asked by a question, or corrected by hand.
  const setInstrument = (file: DroppedFile, instrumentId: number) =>
    setDropped((current) =>
      withDropped(
        current.filter((other) => other.key !== file.key),
        [{ ...file, role: 'part', instrumentId, problem: null }],
      ),
    );
  const remove = (file: DroppedFile) =>
    setDropped((current) => current.filter((other) => other.key !== file.key));

  const toRecord = () => {
    // The first time: the name of the MuseScore file is the name of the song.
    if (!draft) {
      const score = placed.find((file) => file.role === 'museScore');
      setDraft({
        ...draftOf(),
        name: score ? score.file.name.replace(/\.[^.]+$/, '') : '',
        versionOn: today(),
        versionNote: t('songs.import.firstVersion'),
      });
    }
    setStep(2);
  };

  const save = async () => {
    if (!draft) return;
    const found = checkDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setState('sending');
    try {
      const song = await api<Song>('/api/songs', { method: 'POST', body: recordOf(draft) });
      const failures = await sendFiles(song.id, placed, (sent, total) =>
        setProgress({ sent, total }),
      );
      await queryClient.invalidateQueries({ queryKey: ['songs'] });
      if (failures.length > 0) {
        setCreated({ songId: song.id, refused: failures.map(refusal) });
        setState('idle');
        return;
      }
      navigate(`/songs/${song.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.error === 'invalidInput') {
        setErrors(error.fields as SongErrors);
        setState('idle');
      } else {
        setState('failed');
      }
    }
  };

  const summary = t('songs.import.placed', { count: placed.length });
  const stepIndicator = (
    <StepIndicator
      step={step}
      of={2}
      label={t(step === 1 ? 'songs.import.step1' : 'songs.import.step2')}
    />
  );

  // The song is created, and some files did not leave.
  if (created) {
    return (
      <AppLayout
        current="songs"
        back="/songs"
        title={t('songs.import.title')}
        width="form"
        actions={
          <BottomBar>
            <Button onClick={() => navigate(`/songs/${created.songId}`)}>
              {t('songs.import.openSong')}
            </Button>
          </BottomBar>
        }
      >
        <Message kind="warning">{t('songs.import.createdWithProblems')}</Message>
        {created.refused.map((text) => (
          <Message key={text} kind="danger">
            {text}
          </Message>
        ))}
      </AppLayout>
    );
  }

  if (step === 2 && draft) {
    return (
      <AppLayout
        current="songs"
        back="/songs"
        onBack={() => setStep(1)}
        backLabel={t('songs.import.back')}
        step={stepIndicator}
        title={t('songs.import.title')}
        subtitle={t(isDesktop ? 'songs.import.introRecord' : 'songs.import.introRecordPhone')}
        width="form"
        onSubmit={save}
        actions={
          <BottomBar
            surface="glass"
            caption={
              state === 'sending' || !isDesktop
                ? undefined
                : { kind: 'info', text: t('songs.import.nothingSaved') }
            }
          >
            <Button type="submit" disabled={state === 'sending'}>
              {t('songs.import.save')}
            </Button>
            {/* On a phone the way back is the button at the top. */}
            <span className="songs-desktopOnly">
              <Button
                type="button"
                kind="secondary"
                disabled={state === 'sending'}
                onClick={() => setStep(1)}
              >
                {t('songs.import.back')}
              </Button>
            </span>
          </BottomBar>
        }
      >
        {state === 'failed' && <Message kind="danger">{t('errors.unreachable')}</Message>}
        {state === 'sending' && (
          <div className="songs-sending" role="status">
            <Gauge
              value={progress.sent}
              total={Math.max(1, progress.total)}
              text={t('songs.import.sending', progress)}
            />
          </div>
        )}
        <Message>
          {ignored.length > 0
            ? t('songs.import.filesSummary', {
                placed: summary,
                ignored: t('songs.import.ignoredShort', { count: ignored.length }),
              })
            : t('songs.import.filesSummaryNoIgnored', { placed: summary })}
        </Message>
        <SongFormFields draft={draft} onChange={setDraft} errors={errors} isNew />
      </AppLayout>
    );
  }

  const canContinue = placed.length > 0 && questions.length === 0;
  const tiles: { icon: IconName; kind: string; title: string; hint: string }[] = [
    { icon: 'Check', kind: 'placed', title: summary, hint: t('songs.import.placedHint') },
    ...(questions.length > 0
      ? [
          {
            icon: 'Alert' as const,
            kind: 'questions',
            title: t('songs.import.questions', { count: questions.length }),
            hint: t('songs.import.questionsHint'),
          },
        ]
      : []),
    ...(ignored.length > 0
      ? [
          {
            icon: 'Info' as const,
            kind: 'ignored',
            title: t('songs.import.ignored', { count: ignored.length }),
            hint: t('songs.import.ignoredHint'),
          },
        ]
      : []),
  ];

  return (
    <>
      <AppLayout
        current="songs"
        back="/songs"
        backLabel={t('nav.songs')}
        step={stepIndicator}
        title={t('songs.import.title')}
        subtitle={t(
          !isDesktop
            ? 'songs.import.introPhone'
            : dropped.length === 0
              ? 'songs.import.introEmpty'
              : 'songs.import.intro',
        )}
        width="form"
        actions={
          <BottomBar
            surface={dropped.length > 0 ? 'glass' : 'plain'}
            caption={
              canContinue
                ? undefined
                : {
                    kind: questions.length > 0 ? 'warning' : 'info',
                    text:
                      questions.length > 0
                        ? t('songs.import.needAnswers', { count: questions.length })
                        : t('songs.import.needFiles'),
                  }
            }
          >
            <Button disabled={!canContinue} onClick={toRecord}>
              {t('songs.import.continue')}
            </Button>
            <span className="songs-desktopOnly">
              <Button kind="secondary" onClick={() => navigate('/songs')}>
                {t('songs.import.cancel')}
              </Button>
            </span>
          </BottomBar>
        }
      >
        {state === 'failed' && <Message kind="danger">{t('errors.unreachable')}</Message>}
        {/* Always there: more files can be added at any time, they join the list. */}
        <DropZone
          size="large"
          title={t(isDesktop ? 'songs.import.dropTitle' : 'songs.import.dropTitlePhone')}
          hint={t(
            !isDesktop
              ? 'songs.import.dropHintPhone'
              : dropped.length === 0
                ? 'songs.import.dropHintEmpty'
                : 'songs.import.dropHint',
          )}
          buttonLabel={t('songs.import.choose')}
          onFiles={drop}
        />

        {dropped.length > 0 && (
          <ul className="songs-summary">
            {tiles.map((tile) => (
              <li key={tile.kind} data-kind={tile.kind}>
                <Icon name={tile.icon} size={20} />
                <span>
                  <strong className="textLabel">{tile.title}</strong>
                  <span className="textCaption songs-muted">{tile.hint}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {questions.length > 0 && (
          <section className="songs-questions">
            <h2 className="textHeading">
              {t('songs.import.questionTitle', { count: questions.length })}
            </h2>
            {questions.map((file) => (
              <div key={file.key} className="songs-question">
                <p className="textBodyStrong">
                  {t('songs.import.question', { file: file.file.name })}
                </p>
                <p className="textCaption songs-muted">
                  {t(
                    file.problem === 'severalInstruments'
                      ? 'songs.import.severalInstruments'
                      : 'songs.import.noInstrument',
                  )}
                </p>
                <SelectField
                  label={t('songs.import.instrumentOf', { file: file.file.name })}
                  value=""
                  onChange={(id) => id !== '' && setInstrument(file, Number(id))}
                  options={[
                    { value: '', label: t('songs.import.chooseInstrument') },
                    ...instruments.map((instrument) => ({
                      value: String(instrument.id),
                      label: instrument.name,
                    })),
                  ]}
                />
              </div>
            ))}
          </section>
        )}

        {placed.length > 0 && (
          <Sheet title={t('songs.import.placedTitle', { count: placed.length })}>
            <p className="textCaption songs-muted">
              {t(isDesktop ? 'songs.import.placedNote' : 'songs.import.placedNotePhone')}
            </p>
            <ul className="songs-rows">
              {placed.map((file) => (
                <li key={file.key}>
                  <FileLine
                    label={labelOf(file)}
                    fileName={
                      file.role === 'cover'
                        ? t('songs.import.coverCropped', { file: file.file.name })
                        : file.file.name
                    }
                    action={{
                      icon: 'Pencil',
                      label: t('songs.import.correct', { file: file.file.name }),
                      onPress: () => setCorrecting(file),
                    }}
                  />
                </li>
              ))}
            </ul>
          </Sheet>
        )}

        {ignored.map((file) => (
          <Message key={file.key}>
            {t('songs.import.ignoredFile', { file: file.file.name })}
          </Message>
        ))}
      </AppLayout>

      <Panel
        open={correcting !== null}
        onClose={() => setCorrecting(null)}
        title={t('songs.import.correctTitle')}
      >
        {correcting && (
          <div className="songs-panel">
            <p className="songs-muted">{correcting.file.name}</p>
            {correcting.role === 'part' && (
              <SelectField
                label={t('songs.import.instrumentOf', { file: correcting.file.name })}
                value={String(correcting.instrumentId ?? '')}
                onChange={(id) => {
                  if (id !== '') setInstrument(correcting, Number(id));
                  setCorrecting(null);
                }}
                options={instruments.map((instrument) => ({
                  value: String(instrument.id),
                  label: instrument.name,
                }))}
              />
            )}
            <Button
              kind="quiet"
              icon="Trash"
              onClick={() => {
                remove(correcting);
                setCorrecting(null);
              }}
            >
              {t('songs.import.notASongFile')}
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
