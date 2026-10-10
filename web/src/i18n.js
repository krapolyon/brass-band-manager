import fr from './locales/fr.json';

// Temporary: a plain key lookup, so that no text is written in a component
// from the first screen on. The translation library is chosen with the base
// layer (see docs/scoping.md) and replaces this file, keeping the same keys.
const messages = fr;

export function t(key) {
  return messages[key] ?? key;
}
