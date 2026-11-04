import { onTestServer } from './discord.ts';

// The geocoding service on the test servers: a file of answer the tests write
// (docker-compose.yml, BRASS_BAND_GEOCODING_ANSWERS), read by the server in
// the place of Nominatim (api/src/Gigs/Geocoder.php), which also writes down
// what it was asked. Nothing is ever asked of another site.

const ANSWERS = '/var/www/storage/geocodingAnswers';

/** Forgets the answer and what was asked: every address is then not found. */
export function emptyGeocoding(): void {
  onTestServer(`rm -rf ${ANSWERS}`);
}

/** The point the service answers for any address, as Nominatim writes it. */
export function geocodingAnswers(latitude: string, longitude: string): void {
  onTestServer(
    `mkdir -p ${ANSWERS} && chmod 777 ${ANSWERS} && cat > ${ANSWERS}/answer.json`,
    JSON.stringify([{ lat: latitude, lon: longitude, display_name: 'Made up' }]),
  );
}

/** What the server asked, one search per line, decoded. */
export function geocodingAsked(): URLSearchParams[] {
  const lines = onTestServer(`cat ${ANSWERS}/asked.jsonl 2>/dev/null || true`);
  return lines
    .split('\n')
    .filter(Boolean)
    .map((line) => new URLSearchParams((JSON.parse(line) as { query: string }).query));
}
