// How the screens of songs write a duration, a weight and a day. Numbers and
// dates go through the browser's Intl, in the language of the member.

/** "1:12", "12:05". */
export function duration(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** "3,4 Mo", "48 Mo", "120 ko". */
export function weight(bytes: number, language: string): string {
  const megabytes = bytes / 1_000_000;
  const [value, unit] =
    megabytes >= 1 ? [megabytes, 'megabyte'] : [Math.max(1, bytes / 1000), 'kilobyte'];
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 && unit === 'megabyte' ? 1 : 0,
  }).format(value);
}

/** A day the API gives as "2026-09-14": "14 septembre 2026", or "14 sept." when short. */
export function day(date: string, language: string, form: 'long' | 'short' = 'long'): string {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(
    language,
    form === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short' },
  ).format(new Date(year ?? 1970, (month ?? 1) - 1, dayOfMonth ?? 1));
}

/** An average as the band reads it: "3,6". */
export function average(value: number, language: string): string {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Today, as the form of a song sends a day: "2026-10-12", by the clock of the device. */
export function today(): string {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
