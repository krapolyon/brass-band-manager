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

// How alike what was heard and a way to say a song are, from 0 (nothing in
// common) to 1 (the same). These measures and the way to compare below are
// those of the prototype the owner tried on his phone with the real titles.
/** From here the closest song is added, when it is clearly ahead of the next one. */
const SURE = 0.55;
/** The best is "clearly ahead" when the next one is this far behind. */
const AHEAD = 0.12;
/** From here the member is asked to choose; below, nothing is close. */
const CLOSE = 0.5;
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

// The names of the letters, as a recogniser writes them when a title is
// spelt: "dé a enne cé e" in French, "dee ay en see ee" in English.
const LETTERS: Record<string, string> = {
  ah: 'a',
  be: 'b',
  bee: 'b',
  ce: 'c',
  see: 'c',
  de: 'd',
  dee: 'd',
  ee: 'e',
  eu: 'e',
  ef: 'f',
  effe: 'f',
  ge: 'g',
  gee: 'g',
  ji: 'j',
  jay: 'j',
  ka: 'k',
  kay: 'k',
  el: 'l',
  elle: 'l',
  em: 'm',
  emme: 'm',
  en: 'n',
  enne: 'n',
  oh: 'o',
  pe: 'p',
  pee: 'p',
  ku: 'q',
  er: 'r',
  erre: 'r',
  es: 's',
  esse: 's',
  te: 't',
  tee: 't',
  you: 'u',
  ve: 'v',
  vee: 'v',
  ix: 'x',
  ex: 'x',
  zed: 'z',
  zede: 'z',
};

/**
 * A phrase as it is compared, never as it is saved: cleaned, then three
 * letters or more named in a row joined into a word ("de a enne ce e" becomes
 * "dance"). Fewer are left alone: "elle a" is two words.
 */
function compared(text: string): string {
  const words = cleanPhrase(text).split(' ');
  const letterOf = (word: string) => (word.length === 1 ? word : LETTERS[word]);
  const joined: string[] = [];
  let at = 0;
  while (at < words.length) {
    let end = at;
    let run = '';
    while (end < words.length) {
      const letter = letterOf(words[end] as string);
      if (!letter) break;
      run += letter;
      end++;
    }
    if (run.length >= 3) {
      joined.push(run);
      at = end;
    } else {
      joined.push(words[at] as string);
      at++;
    }
  }
  return joined.join(' ');
}

/**
 * A rough key of how a phrase sounds, so that an English title said or heard
 * the French way still meets its name: "ph" is "f", "oo" is "ou", a doubled
 * letter is one, spaces do not count.
 */
function sound(phrase: string): string {
  return phrase
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ck|q/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/ee|ea|ie|ay|ai|ei|y/g, 'i')
    .replace(/oo|ou/g, 'u')
    .replace(/w/g, 'v')
    .replace(/h/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/e\b/g, '')
    .replace(/ /g, '');
}

const pairs = (text: string): string[] => {
  const padded = ` ${text} `;
  return Array.from({ length: padded.length - 1 }, (_, index) => padded.slice(index, index + 2));
};

/** The share of pairs of letters two texts have in common, from 0 to 1. */
function shared(one: string, other: string): number {
  if (one === '' || other === '') return 0;
  const [left, right] = [pairs(one), pairs(other)];
  const counts = new Map<string, number>();
  for (const pair of left) counts.set(pair, (counts.get(pair) ?? 0) + 1);
  let hits = 0;
  for (const pair of right) {
    const count = counts.get(pair) ?? 0;
    if (count === 0) continue;
    hits++;
    counts.set(pair, count - 1);
  }
  return (2 * hits) / (left.length + right.length);
}

/** How alike a phrase heard and a way to say a song are, from 0 to 1. Both are `compared`. */
function likeness(heard: string, said: string): number {
  if (heard === said) return 1;
  const [a, b] = [sound(heard), sound(said)];
  // A short name has too few pairs of letters to compare: its sound alone decides.
  const sameSound = a !== '' && a === b ? 0.95 : 0;
  return Math.max(sameSound, shared(heard, said), shared(a, b));
}

type Scored = { songId: number; score: number };

/** The songs a setlist can hold, the closest to a phrase first. */
function rank(phrase: string, songs: Spoken[]): Scored[] {
  return songs
    .map((song) => ({
      songId: song.songId,
      score: Math.max(
        ...[song.name, ...song.phrases].map((said) => likeness(phrase, compared(said))),
      ),
    }))
    .sort((one, other) => other.score - one.score);
}

function decide(phrase: string, ranked: Scored[]): Heard {
  const [best, second] = ranked;
  if (!best || best.score < CLOSE) return { kind: 'none', phrase };
  // A name or a phrase heard exactly wins at once, unless two songs have it;
  // otherwise the closest is added when it is clearly ahead of the next one.
  if (best.score >= SURE && (!second || best.score - second.score >= AHEAD)) {
    return { kind: 'one', phrase, songId: best.songId };
  }
  return {
    kind: 'several',
    phrase,
    songIds: ranked.slice(0, MAX_CHOICES).map((one) => one.songId),
  };
}

/** What a phrase heard means among the songs a setlist can hold. */
export function recognise(text: string, songs: Spoken[]): Heard {
  const phrase = cleanPhrase(text);
  if (phrase === '') return { kind: 'none', phrase };
  return decide(phrase, rank(compared(text), songs));
}

/**
 * The same, for what a recogniser gives: several wordings of one thing heard,
 * the likeliest first. The wording kept is the one whose closest song is the
 * closest of all; the phrase is always of that wording.
 */
export function recogniseAny(wordings: string[], songs: Spoken[]): Heard & { said: string } {
  let kept: { said: string; phrase: string; ranked: Scored[] } | null = null;
  for (const said of wordings) {
    const phrase = cleanPhrase(said);
    if (phrase === '') continue;
    const ranked = rank(compared(said), songs);
    if (!kept || (ranked[0]?.score ?? 0) > (kept.ranked[0]?.score ?? 0)) {
      kept = { said, phrase, ranked };
    }
  }
  if (!kept) return { kind: 'none', phrase: '', said: wordings[0] ?? '' };
  return { ...decide(kept.phrase, kept.ranked), said: kept.said };
}
