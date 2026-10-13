import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';
import { Button } from '../components/Button.tsx';
import { Panel } from '../components/Panel.tsx';

/**
 * Asks before a form with changes is left, whatever the way out: its own way
 * back, a link of the menu, the back button of the browser or of the phone.
 * Written once for every form.
 *
 *   const guard = useLeaveGuard(isDirty, t('…leaveLead'));
 *   …
 *   guard.letGo();        // once saved, before navigating away
 *   navigate(back);
 *   …
 *   {guard.panel}         // anywhere in what the screen renders
 */
export function useLeaveGuard(
  isDirty: boolean,
  lead: string,
): { panel: ReactNode; letGo: () => void } {
  const { t } = useTranslation();
  // Read when a navigation starts, which can be in the very event that saved.
  const dirty = useRef(isDirty);
  dirty.current = isDirty;
  const free = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty.current && !free.current && currentLocation.pathname !== nextLocation.pathname,
  );

  // Closing the tab or reloading: only the browser can ask, in its own words.
  useEffect(() => {
    if (!isDirty) return;
    const ask = (event: BeforeUnloadEvent) => {
      if (!free.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [isDirty]);

  const stay = () => blocker.state === 'blocked' && blocker.reset();

  return {
    letGo: () => {
      free.current = true;
    },
    panel: (
      <Panel open={blocker.state === 'blocked'} onClose={stay} title={t('common.leave.title')}>
        <div className="LeaveGuard">
          <p className="textBody">{lead}</p>
          <Button kind="danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
            {t('common.leave.leave')}
          </Button>
          <Button kind="secondary" onClick={stay}>
            {t('common.leave.stay')}
          </Button>
        </div>
      </Panel>
    ),
  };
}
