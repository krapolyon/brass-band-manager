import { useCallback, useEffect, useRef, useState } from 'react';

// The speech recognition of the browser (Web Speech API), as the dictation of
// a setlist uses it: it listens until it is stopped, and hands over each
// thing heard once it is final. The sound goes to the recogniser of the
// device (Apple, Google); only text reaches the app. No library: the browser
// does the job, where it can.

// The part of the Web Speech API used here: TypeScript does not know it.
type Alternative = { transcript: string };
type Result = { isFinal: boolean; length: number; [index: number]: Alternative };
type ResultEvent = { resultIndex: number; results: { length: number; [index: number]: Result } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionClass = new () => Recognition;

const recognitionClass = (): RecognitionClass | undefined => {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};

/** Why the dictation stopped by itself: the microphone is refused, or the recogniser failed. */
export type DictationProblem = 'denied' | 'failed';

/**
 * @param language The language spoken, as the app has it: "fr"
 * @param onHeard Called with what was heard, the likeliest wording first
 */
export function useDictation(language: string, onHeard: (wordings: string[]) => void) {
  const [isListening, setListening] = useState(false);
  const [problem, setProblem] = useState<DictationProblem | null>(null);
  const recognition = useRef<Recognition | null>(null);
  // Whether the member still wants it to listen: a phone stops by itself
  // after a silence, and is started again.
  const wanted = useRef(false);
  const heard = useRef(onHeard);
  heard.current = onHeard;

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Class = recognitionClass();
    if (!Class) return;
    const one = new Class();
    one.lang = language;
    one.continuous = true;
    one.interimResults = false;
    one.maxAlternatives = 3;
    one.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (!result?.isFinal) continue;
        const wordings = Array.from({ length: result.length }, (_, at) =>
          (result[at]?.transcript ?? '').trim(),
        ).filter((wording) => wording !== '');
        if (wordings.length > 0) heard.current(wordings);
      }
    };
    one.onerror = ({ error }) => {
      // A silence is not a failure: the phone goes on, or is started again.
      if (error === 'no-speech' || error === 'aborted') return;
      wanted.current = false;
      setProblem(error === 'not-allowed' || error === 'service-not-allowed' ? 'denied' : 'failed');
    };
    one.onend = () => {
      if (wanted.current) {
        try {
          one.start();
          return;
        } catch {
          wanted.current = false;
          setProblem('failed');
        }
      }
      setListening(false);
    };
    recognition.current = one;
    wanted.current = true;
    setProblem(null);
    try {
      one.start();
      setListening(true);
    } catch {
      wanted.current = false;
      setProblem('failed');
    }
  }, [language]);

  // Leaving the screen stops the microphone.
  useEffect(
    () => () => {
      wanted.current = false;
      recognition.current?.abort();
    },
    [],
  );

  return { isSupported: recognitionClass() !== undefined, isListening, problem, start, stop };
}
