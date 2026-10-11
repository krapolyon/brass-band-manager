import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';

// Every text shown to a member is a key of locales/<language>.json, read with
// the useTranslation() hook. French is the reference: a key exists there
// first, and TypeScript refuses a key that is not in fr.json (see i18next.d.ts).
//
// Adding a language: add locales/<language>.json with the same keys, and list
// it in "resources" below.
export const defaultLanguage = 'fr';

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
  },
  lng: defaultLanguage,
  fallbackLng: defaultLanguage,
  // The translations are part of the built files: nothing to wait for.
  initAsync: false,
  interpolation: {
    // React already protects the text it displays.
    escapeValue: false,
  },
});

// The name of a language in that language, as a member expects to find it in
// a list: "Français", "English". Given by the browser, not by a translation.
export function languageName(language: string): string {
  const name = new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
}

// The page says which language it is in: screen readers pick their voice from it.
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

export default i18n;
