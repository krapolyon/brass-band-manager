import { useTranslation } from 'react-i18next';

// The rule of a new password (model/members.md, "passwordHash" and "Choosing
// a password"; NIST SP 800-63B-4). The API checks it again, with what the
// front cannot know: the most used passwords, the email and the band.
export const PASSWORD_MIN_CHARACTERS = 15;

/** What the field of a new password shows under it: a hint, or an error. */
export type PasswordHint = { hint?: string; hintTone?: 'neutral' | 'success'; error?: string };

/**
 * The one hint line that lives with the typing (Figma: Members, section 17):
 * the rule while the field is empty, the characters still missing, then
 * Success once the password is long enough. What was still missing when it
 * was sent is an error, and so is a refusal of the API, while the password is
 * the one sent: typing again counts down as before.
 *
 *   const hintOf = usePasswordHint();
 *   <PasswordField {...hintOf(password, sentPassword, fields.password)} />
 *
 * `sent` is the password last sent, null before the first try; `refused` is
 * the key the API gave for it: tooShort, tooLong, invalid, tooCommon or
 * tooPersonal.
 */
export function usePasswordHint() {
  const { t } = useTranslation();

  return (password: string, sent: string | null, refused?: string): PasswordHint => {
    const missing = PASSWORD_MIN_CHARACTERS - [...password].length;
    if (missing > 0) {
      const text =
        password === '' && sent === null
          ? t('password.rule')
          : t('password.remaining', { count: missing });
      return password === sent ? { error: text } : { hint: text };
    }
    if (refused && password === sent) {
      return {
        error: t(
          refused === 'tooCommon'
            ? 'password.tooCommon'
            : refused === 'tooPersonal'
              ? 'password.tooPersonal'
              : 'password.invalid',
        ),
      };
    }
    return { hint: t('password.met'), hintTone: 'success' };
  };
}
