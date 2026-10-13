// The dictation of a setlist: what was heard is compared with the names of
// the songs a setlist can hold and with the phrases learned for them
// (model/songs.md, entry 4). Nothing here listens: see useDictation.

/** A song as the dictation knows it. */
export type Spoken = { songId: number; name: string; phrases: string[] };

export type Heard =
  /** One song, clearly: it is added. */
  | { kind: 'one'; phrase: string; songId: number }
  /** Songs that sound alike: the member chooses. */
  | { kind: 'several'; phrase: string; songIds: number[] }
  /** Nothing close: nothing is added. */
  | { kind: 'none'; phrase: string };

// How alike two texts must be, from 0 (nothing in common) to 1 (the same).
const CLOSE = 0.65;
/** The best is "clearly ahead" when the next one is this far behind. */
const AHEAD = 0.15;
// Figma draws the choice between two songs (“Aucun des deux”).
const MAX_CHOICES = 2;

/**
 * A phrase as it is compared and saved: lowercase, accents removed, its words
 * separated by one space, and the letters said one by one joined into a word
 * ("d a n c e" becomes "dance"). The same rule as SpokenNames::clean() in the API.
 */
export function cleanPhrase(text: string): string {
  const words = text
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
  const joined: string[] = [];
  let letters = '';
  for (const word of [...words, '']) {
    if (/^[a-z]$/.test(word)) {
      letters += word;
      continue;
    }
    if (letters !== '') joined.push(letters);
    letters = '';
    if (word !== '') joined.push(word);
  }
  return joined.join(' ');
}

/** How many letters to add, remove or change to go from one text to the other. */
function distance(one: string, other: string): number {
  let previous = Array.from({ length: other.length + 1 }, (_, index) => index);
  for (let i = 1; i <= one.length; i++) {
    const row = [i];
    for (let j = 1; j <= other.length; j++) {
      row[j] = Math.min(
        (previous[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (previous[j - 1] as number) + (one[i - 1] === other[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[other.length] as number;
}

/** How alike a phrase heard and a way to say a song are, from 0 to 1. */
function likeness(heard: string, said: string): number {
  if (heard === said) return 1;
  // Spaces are where the recognition is least sure: "seven nation", "sevennation".
  const [a, b] = [heard.replaceAll(' ', ''), said.replaceAll(' ', '')];
  if (a === b) return 0.95;
  const letters = 1 - distance(a, b) / Math.max(a.length, b.length);
  // The start of a longer title, said whole words: "crazy" for "crazy in love".
  const starts = said.startsWith(`${heard} `) || heard.startsWith(`${said} `);
  return starts ? Math.max(letters, 0.7) : letters;
}

/** What a phrase heard means among the songs a setlist can hold. */
export function recognise(text: string, songs: Spoken[]): Heard {
  const phrase = cleanPhrase(text);
  if (phrase === '') return { kind: 'none', phrase };

  const scored = songs
    .map((song) => ({
      songId: song.songId,
      score: Math.max(
        ...[cleanPhrase(song.name), ...song.phrases].map((said) => likeness(phrase, said)),
      ),
    }))
    .filter((one) => one.score >= CLOSE)
    .sort((one, other) => other.score - one.score);

  const [best, second] = scored;
  if (!best) return { kind: 'none', phrase };
  // A name or a phrase heard exactly wins at once, unless two songs have it;
  // otherwise the closest is added when it is clearly ahead of the next one.
  const isExact = best.score === 1 && (!second || second.score < 1);
  if (isExact || !second || best.score - second.score >= AHEAD) {
    return { kind: 'one', phrase, songId: best.songId };
  }
  return {
    kind: 'several',
    phrase,
    songIds: scored.slice(0, MAX_CHOICES).map((one) => one.songId),
  };
}

/**
 * The same, for what a recogniser gives: several wordings of one thing heard,
 * the likeliest first. The first wording that names one song wins, then the
 * first that is close to some; the phrase kept is always of that wording.
 */
export function recogniseAny(wordings: string[], songs: Spoken[]): Heard & { said: string } {
  const all = wordings.map((said) => ({ ...recognise(said, songs), said }));
  return (
    all.find((one) => one.kind === 'one') ??
    all.find((one) => one.kind === 'several') ??
    all[0] ?? { kind: 'none', phrase: '', said: '' }
  );
}
