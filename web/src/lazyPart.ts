import { type ComponentType, lazy } from 'react';

const RELOADED = 'lazyPartReloaded';

/**
 * A large part of a screen, loaded only when it is shown (React.lazy): the
 * MIDI player and the Live mode, with the sound engine they bring. The app
 * starts lighter for everyone. Show it inside <Suspense>.
 *
 *   const MidiView = lazyPart(() => import('./MidiView.tsx'), (module) => module.MidiView);
 *
 * After a new version is put online, a page opened before asks for files
 * that are gone. The page is then loaded again, once, to get the new
 * version; a second failure in a row is an error like any other.
 */
export function lazyPart<Module, Props extends object>(
  load: () => Promise<Module>,
  pick: (module: Module) => ComponentType<Props>,
) {
  return lazy(async () => {
    try {
      const module = await load();
      remember(false);
      return { default: pick(module) };
    } catch (error) {
      if (wasReloaded()) throw error;
      remember(true);
      window.location.reload();
      // Nothing to show until the page is loaded again.
      return new Promise<never>(() => {});
    }
  });
}

// The storage of the browser can be refused (a private window): the page is
// then never loaded again by itself.
function wasReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOADED) !== null;
  } catch {
    return true;
  }
}

function remember(isReloading: boolean) {
  try {
    if (isReloading) sessionStorage.setItem(RELOADED, '1');
    else sessionStorage.removeItem(RELOADED);
  } catch {
    // Nothing to remember without storage.
  }
}
