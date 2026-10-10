import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { Outlet } from 'react-router';

// What the member has entered so far in the install. It lives in memory only,
// for as long as the install screens are open: nothing is saved before the
// last step is confirmed (model/members.md, "Install"), and the install key
// in particular is never written anywhere on the device.
//
// Reloading the page therefore starts the install again from the welcome
// screen, which is where every later step sends a visitor who has no key.
export type InstallDraft = {
  /** Checked by the API on the welcome screen; sent again with the install. */
  installKey: string;
};

type Store = {
  draft: InstallDraft;
  update: (changes: Partial<InstallDraft>) => void;
};

const Context = createContext<Store | null>(null);

const empty: InstallDraft = { installKey: '' };

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
