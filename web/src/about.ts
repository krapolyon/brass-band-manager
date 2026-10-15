import { useQuery } from '@tanstack/react-query';

// The version of the app and its changelog (docs/architecture.md, "Versions
// and the changelog"). Two static files written by the build (vite.config.ts):
// version.json and changelog.json. The API has no part in it.

export type ChangeKind = 'added' | 'changed' | 'fixed';
export const changeKinds: ChangeKind[] = ['added', 'changed', 'fixed'];

/** One version: its number, the day it reached beta, its changes in English. */
export type ChangelogEntry = {
  version: string;
  /** YYYY-MM-DD. */
  date: string;
  changes: { kind: ChangeKind; text: string }[];
};

type Changelog = {
  /** The newest version first. */
  en: ChangelogEntry[];
  /** The French of each line, by version and by English line. */
  fr: Record<string, Record<string, string>>;
};

/** What the build says about itself. */
export type Build = { version: string; builtAt: string; commit: string };

/** Asked again each time: a new build must not be hidden behind an old answer. */
async function file<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} could not be read`);
  return (await response.json()) as T;
}

export function useBuild() {
  return useQuery({ queryKey: ['build'], queryFn: () => file<Build>('/version.json') });
}

export function useChangelog() {
  return useQuery({ queryKey: ['changelog'], queryFn: () => file<Changelog>('/changelog.json') });
}

/** A line in the language of the member, or in English when it has no translation. */
export function lineIn(changelog: Changelog, version: string, text: string, language: string) {
  // English is the source; French is the one translation so far.
  const translations = language === 'fr' ? changelog.fr : undefined;
  return translations?.[version]?.[text] ?? text;
}
