import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SESSION_ENDED } from './api.ts';
import { applyAppearance } from './appearance.ts';
import { useBand } from './band.ts';
import { useAccessibilityBeforeSignIn } from './deviceAccessibility.ts';
import { useMe } from './session.ts';

// Decides how the app looks and which language it speaks, for whoever is in
// front of it. Signed in: the choices of the account. Not signed in: the
// scheme of the device, the theme and the language of the band, and the
// accessibility options kept on this device (or being chosen during an
// invitation).
export function AppearanceOf() {
  const { i18n } = useTranslation();
  const me = useMe().data;
  const band = useBand().data;
  const beforeSignIn = useAccessibilityBeforeSignIn();

  useEffect(() => {
    if (me) {
      applyAppearance(me);
    } else {
      applyAppearance({ colorScheme: 'AUTO', accentTheme: null, ...beforeSignIn });
    }
  }, [me, beforeSignIn]);

  // A request refused because the session is over: the app asks again who is
  // signed in, and its guard then leads to the sign-in screen.
  const queryClient = useQueryClient();
  useEffect(() => {
    const ask = () => queryClient.invalidateQueries({ queryKey: ['me'] });
    window.addEventListener(SESSION_ENDED, ask);
    return () => window.removeEventListener(SESSION_ENDED, ask);
  }, [queryClient]);

  const language = me?.language ?? band?.defaultLanguage;
  useEffect(() => {
    if (language && language !== i18n.language && i18n.hasResourceBundle(language, 'translation')) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  return null;
}
