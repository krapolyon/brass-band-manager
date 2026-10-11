import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/min';

// Phone numbers are stored in international format ("+33612345678") and
// shown in the local one ("06 12 34 56 78") (model/members.md). A number
// typed without its country prefix is read as a number of a country: the one
// of the member when they gave it, otherwise the one of the band.

/** The international form of what was typed; null when it is not a possible number. Empty stays empty. */
export function toInternational(typed: string, country: string): string | null {
  if (typed.trim() === '') return '';
  const number = parsePhoneNumberFromString(typed, country as CountryCode);
  return number?.isPossible() ? number.number : null;
}

/** A stored number as a member reads it: in the local format in its own country, in the international one elsewhere. */
export function phoneForDisplay(stored: string | null, country: string): string {
  if (!stored) return '';
  const number = parsePhoneNumberFromString(stored);
  if (!number) return stored;
  return number.country === country ? number.formatNational() : number.formatInternational();
}
