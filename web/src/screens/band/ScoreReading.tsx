import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { readScoreOf } from './readScores.ts';

type Props = {
  /** The songs with a MuseScore file and neither a MIDI file nor a MusicXML. */
  songs: { id: number; name: string }[];
  /** Right after a load: the reading starts by itself. */
  startsAtOnce: boolean;
};

// The reading of the scores a reprise brought (readScores.ts), on the screen
// "Importer". Not drawn in Figma: made of a Message and a Button, the
// progress written as a status. The page has to stay open while it reads.
export function ScoreReading({ songs, startsAtOnce }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [done, setDone] = useState<number | null>(null);
  const [notRead, setNotRead] = useState<string[]>([]);
  const [isStopped, setStopped] = useState(false);
  const [total, setTotal] = useState(0);
  const hasStarted = useRef(false);
  const isRunning = done !== null && done < total;

  const run = async () => {
    if (hasStarted.current || songs.length === 0) return;
    hasStarted.current = true;
    const list = [...songs];
    setTotal(list.length);
    setDone(0);
    setNotRead([]);
    setStopped(false);
    const failed: string[] = [];
    for (const [index, song] of list.entries()) {
      try {
        if (!(await readScoreOf(song.id))) failed.push(song.name);
      } catch {
        // The server is away: what is left waits for the next visit.
        setStopped(true);
        setDone(list.length);
        break;
      }
      setNotRead([...failed]);
      setDone(index + 1);
    }
    hasStarted.current = false;
    await queryClient.invalidateQueries();
  };

  // Once, when the screen says the data are loaded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run is made anew at each render, and reads the latest list itself
  useEffect(() => {
    if (startsAtOnce) void run();
  }, [startsAtOnce]);

  // Leaving the page stops the reading: the browser asks first.
  useEffect(() => {
    if (!isRunning) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [isRunning]);

  if (isRunning) {
    return (
      <p role="status" className="band-hint textCaption">
        {t('band.transfer.scores.reading', { done, count: total })}
      </p>
    );
  }
  if (done !== null) {
    const read = total - notRead.length;
    return (
      <>
        {isStopped ? (
          <Message kind="danger">{t('band.transfer.scores.stopped')}</Message>
        ) : (
          read > 0 && (
            <Message kind="success">{t('band.transfer.scores.read', { count: read })}</Message>
          )
        )}
        {notRead.length > 0 && (
          <Message kind="warning">
            {t('band.transfer.scores.notRead', {
              count: notRead.length,
              names: notRead.join(', '),
            })}
          </Message>
        )}
      </>
    );
  }
  if (songs.length === 0) return null;
  return (
    <>
      <Message>{t('band.transfer.scores.waiting', { count: songs.length })}</Message>
      <Button kind="secondary" icon="Music" onClick={() => void run()}>
        {t('band.transfer.scores.start')}
      </Button>
    </>
  );
}
