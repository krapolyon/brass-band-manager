import { Component, type ComponentType, lazy, type ReactNode } from 'react';

const RELOADED = 'lazyPartReloaded';
// A reload older than this was for an earlier failure, not this one.
const RELOAD_MEMORY_MS = 60_000;

/**
 * A large part of a screen, loaded only when it is shown (React.lazy): the
 * MIDI player and the Live mode, with the sound engine they bring. The app
 * starts lighter for everyone. Show it inside <Suspense> and <PartFailed>.
 *
 *   const MidiView = lazyPart(() => import('./MidiView.tsx'), (module) => module.MidiView);
 *
 * After a new version is put online, a page opened before asks for files
 * that are gone. The page is then loaded again, once, to get the new
 * version. Without a network a reload would lose the app, so the failure is
 * shown instead, by <PartFailed>, as is a second failure in a row.
 *
 * `preload()` fetches the part ahead, where it must not depend on the network
 * later: the live setlist, during a gig.
 */
export function lazyPart<Module, Props extends object>(
  load: () => Promise<Module>,
  pick: (module: Module) => ComponentType<Props>,
) {
  const part = lazy(async () => {
    try {
      const module = await load();
      remember(false);
      return { default: pick(module) };
    } catch (error) {
      if (!navigator.onLine || wasJustReloaded()) throw error;
      remember(true);
      window.location.reload();
      // Nothing to show until the page is loaded again.
      return new Promise<never>(() => {});
    }
  });
  return Object.assign(part, {
    preload: () => {
      load().catch(() => {
        // Tried again when the part is shown.
      });
    },
  });
}

/** What a part shows when it could not be loaded, instead of the error page of the router. */
export class PartFailed extends Component<
  { failed: ReactNode; children: ReactNode },
  { hasFailed: boolean }
> {
  state = { hasFailed: false };

  static getDerivedStateFromError() {
    return { hasFailed: true };
  }

  render() {
    return this.state.hasFailed ? this.props.failed : this.props.children;
  }
}

// The storage of the browser can be refused (a private window): the page is
// then never loaded again by itself.
function wasJustReloaded(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOADED));
    return at > 0 && Date.now() - at < RELOAD_MEMORY_MS;
  } catch {
    return true;
  }
}

function remember(isReloading: boolean) {
  try {
    if (isReloading) sessionStorage.setItem(RELOADED, String(Date.now()));
    else sessionStorage.removeItem(RELOADED);
  } catch {
    // Nothing to remember without storage.
  }
}
