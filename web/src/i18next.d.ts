import 'i18next';
import type fr from './locales/fr.json';

// Tells TypeScript which keys exist, so that t('shell.redy') is an error.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof fr;
    };
  }
}
