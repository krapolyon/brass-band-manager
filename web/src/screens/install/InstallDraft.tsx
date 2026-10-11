import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import type { LogoInput } from './installApi.ts';

// What the member has entered so far in the install. It lives in memory only,
// for as long as the install screens are open: nothing is saved before the
// last step is confirmed (model/members.md, "Install"), and the install key
// and the password in particular are never written anywhere on the device.
//
// Reloading the page therefore starts the install again from the welcome
// screen, which is where every step sends a visitor who has no key.

export type DraftInstrument = {
  /** A number of this draft only, to tell rows apart while names change. */
  id: number;
  name: string;
  /** Kept for the band. An instrument that is not ticked is not sent. */
  isTicked: boolean;
};

export type DraftSection = {
  id: number;
  name: string;
  instruments: DraftInstrument[];
};

export type DraftMember = {
  firstName: string;
  lastName: string;
  nickname: string;
  /** The id of one of the ticked instruments of the draft. */
  instrumentId: number | null;
  email: string;
  password: string;
};

/** What the last screen shows once the install is done. */
export type InstallSummary = {
  bandName: string;
  sectionCount: number;
  instrumentCount: number;
  nickname: string;
  instrument: string;
};

export type InstallDraft = {
  /** Checked by the API on the welcome screen; sent again with the install. */
  installKey: string;
  bandName: string;
  logo: File | null;
  /** The logo as the API wants it, prepared when the file is chosen. Null without a logo. */
  logoInput: LogoInput | null;
  /** Null until step 2 changes something: the starting library then applies (see sections.ts). */
  sections: DraftSection[] | null;
  member: DraftMember;
  /** Set when the install has succeeded. */
  summary: InstallSummary | null;
};

type Store = {
  draft: InstallDraft;
  update: (changes: Partial<InstallDraft>) => void;
};

const Context = createContext<Store | null>(null);

const empty: InstallDraft = {
  installKey: '',
  bandName: '',
  logo: null,
  logoInput: null,
  sections: null,
  member: {
    firstName: '',
    lastName: '',
    nickname: '',
    instrumentId: null,
    email: '',
    password: '',
  },
  summary: null,
};

export function InstallDraftProvider({ children }: { children?: ReactNode }) {
  const [draft, setDraft] = useState(empty);
  const store = useMemo<Store>(
    () => ({ draft, update: (changes) => setDraft((current) => ({ ...current, ...changes })) }),
    [draft],
  );

  // As a layout route, it wraps every /install screen (see router.tsx).
  return <Context.Provider value={store}>{children ?? <Outlet />}</Context.Provider>;
}

export function useInstallDraft(): Store {
  const store = useContext(Context);
  if (!store) throw new Error('useInstallDraft is used outside the install screens');
  return store;
}
