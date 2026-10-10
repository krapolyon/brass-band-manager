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

export default i18n;
