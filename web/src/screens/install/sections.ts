import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DraftSection } from './InstallDraft.tsx';
import { useInstallDraft } from './InstallDraft.tsx';
import { type InstallStatus, useInstallStatus } from './installApi.ts';

// The sections and instruments of the install, as steps 2 and 3 see them.

type Library = Extract<InstallStatus, { installed: false }>['library'];

// The starting library as a draft: the instruments it marks as preselected
// are ticked (model/members.md, "Install").
function fromLibrary(library: Library): DraftSection[] {
  return library.sections.map((section, s) => ({
    id: s + 1,
    name: section.name,
    instruments: section.instruments.map((instrument, i) => ({
      id: (s + 1) * 1000 + i,
      name: instrument.name,
      isTicked: instrument.preselected,
    })),
  }));
}

/** The sections of the draft, or the starting library while nothing was changed; and how to change them. */
export function useSections(): [DraftSection[], (sections: DraftSection[]) => void] {
  const { i18n } = useTranslation();
  const { draft, update } = useInstallDraft();
  const status = useInstallStatus(i18n.language);

  const library = status.data?.installed === false ? status.data.library : null;
  const start = useMemo(() => (library ? fromLibrary(library) : []), [library]);

  return [draft.sections ?? start, (sections) => update({ sections })];
}

/** What the install sends: the ticked instruments, in the sections that have some. */
export function keptSections(sections: DraftSection[]): DraftSection[] {
  return sections
    .map((section) => ({
      ...section,
      instruments: section.instruments.filter((instrument) => instrument.isTicked),
    }))
    .filter((section) => section.instruments.length > 0);
}

export function countInstruments(sections: DraftSection[]): number {
  return sections.reduce((count, section) => count + section.instruments.length, 0);
}

/** A number no section and no instrument of the draft has yet. */
export function nextId(sections: DraftSection[]): number {
  const ids = sections.flatMap((section) => [section.id, ...section.instruments.map((i) => i.id)]);
  return Math.max(0, ...ids) + 1;
}

// The form of a name used to tell whether two names are the same. The
// database ignores case and accents ("Flute" and "Flûte" are one name there):
// so does this.
export function nameKey(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
