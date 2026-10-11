import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api.ts';
import { type Me, useMe, useSetMe } from '../../session.ts';

// The preferences of the signed-in member: language, appearance and
// accessibility options. They are seen and changed by the member only
// (model/members.md, "Personal data"). A change applies at once, with no save
// button, and follows the member from one device to another.

type Preferences = Pick<
  Me,
  | 'language'
  | 'colorScheme'
  | 'accentTheme'
  | 'textSizePercent'
  | 'hasHighContrast'
  | 'hasIncreasedSpacing'
  | 'hasLegibleFont'
  | 'hasReducedMotion'
  | 'hasExtendedTimeouts'
>;

/**
 * Changes preferences: shown at once, then saved; put back if the server
 * refuses or does not answer. Returns what changes them, and the state of
 * the saving.
 */
export function useSavePreferences() {
  const saved = useMe().data;
  const setMe = useSetMe();
  // What the member has just chosen, shown in the same instant as the press:
  // a switch that waited for the answer of the server, or even for the next
  // tick, would flick back before turning on.
  const [chosen, setChosen] = useState<Me | null>(null);
  const me = chosen ?? saved;

  const saving = useMutation({
    mutationFn: async ({ before, next }: { before: Me; next: Me }) => {
      try {
        // The API receives every preference at once.
        const answer = await api<Me>('/api/me/preferences', {
          method: 'PUT',
          body: {
            language: next.language,
            colorScheme: next.colorScheme,
            accentTheme: next.accentTheme,
            textSizePercent: next.textSizePercent,
            hasHighContrast: next.hasHighContrast,
            hasIncreasedSpacing: next.hasIncreasedSpacing,
            hasLegibleFont: next.hasLegibleFont,
            hasReducedMotion: next.hasReducedMotion,
            hasExtendedTimeouts: next.hasExtendedTimeouts,
          },
        });
        setMe(answer);
      } catch (error) {
        setMe(before);
        throw error;
      } finally {
        setChosen(null);
      }
    },
  });

  return {
    /** The signed-in member, with what they have just chosen. */
    me,
    isError: saving.isError,
    mutate: (changes: Partial<Preferences>) => {
      if (!me) return;
      const next = { ...me, ...changes };
      setChosen(next);
      setMe(next);
      saving.mutate({ before: me, next });
    },
  };
}
