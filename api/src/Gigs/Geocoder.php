<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

// Where the address of a gig is, asked of a geocoding service so that its map
// shows without coordinates typed (1.1.0; model/gigs.md, "Coordinates found
// from the address"). Nominatim, the service of OpenStreetMap, by default;
// config.php sets another, or '' to search nothing.
//
// Only the server asks, never the device of a member, and only the address:
// its first line, the postal code, the city and the country of the band.
// Never the name of the gig, its notes or anyone's name. Nominatim asks for a
// name that tells which app asks, and one search per second at most: a band
// saves far fewer gigs than that. A refusal, a delay or an address not found
// reads as "nowhere": the gig is saved without coordinates.
final class Geocoder
{
    public const DEFAULT_URL = 'https://nominatim.openstreetmap.org/search';
    private const TIMEOUT_SECONDS = 4;

    /**
     * @param \Closure(string): (string|null)|null $transport Asks the service a search; given by the tests
     */
    public function __construct(
        private readonly string $url,
        private readonly string $appUrl,
        private readonly ?\Closure $transport = null,
    ) {
    }

    /**
     * @param array<string, mixed> $config The configuration of the app: geocoding.url, and geocoding.answersFrom on the test server
     */
    public static function from(array $config): self
    {
        $geocoding = is_array($config['geocoding'] ?? null) ? $config['geocoding'] : [];
        $url = is_string($geocoding['url'] ?? null) ? trim($geocoding['url']) : self::DEFAULT_URL;
        $folder = is_string($geocoding['answersFrom'] ?? null) ? $geocoding['answersFrom'] : '';
        // The test server reads its answer from a file, and writes down what
        // it was asked (docker-compose.yml): the tests ask nothing of another site.
        $transport = $folder === '' ? null : static function (string $query) use ($folder): ?string {
            if (!is_dir($folder)) {
                mkdir($folder, 0777, true);
            }
            file_put_contents($folder . '/asked.jsonl', json_encode(['query' => $query]) . "\n", FILE_APPEND);
            $file = $folder . '/answer.json';

            return is_file($file) ? (string) file_get_contents($file) : null;
        };

        return new self($url, is_string($config['appUrl'] ?? null) ? $config['appUrl'] : '', $transport);
    }

    /**
     * The point of an address, or null when it is not found.
     *
     * @return array{latitude: float, longitude: float}|null
     */
    public function locate(?string $streetAddress, ?string $postalCode, ?string $city, string $countryCode): ?array
    {
        // The first line of the street: the next ones say how to find the door.
        $street = trim(strtok((string) $streetAddress, "\n") ?: '');
        $place = trim(implode(' ', array_filter([trim((string) $postalCode), trim((string) $city)])));
        $text = implode(', ', array_filter([$street, $place]));
        if ($this->url === '' || $text === '') {
            return null;
        }
        $query = http_build_query([
            'q' => $text,
            'countrycodes' => strtolower($countryCode),
            'format' => 'jsonv2',
            'limit' => 1,
        ]);
        $answer = $this->transport !== null ? ($this->transport)($query) : $this->ask($query);
        $found = $answer === null ? null : json_decode($answer, true);
        $first = is_array($found) ? ($found[0] ?? null) : null;
        if (!is_array($first) || !is_numeric($first['lat'] ?? null) || !is_numeric($first['lon'] ?? null)) {
            return null;
        }
        $latitude = (float) $first['lat'];
        $longitude = (float) $first['lon'];

        return abs($latitude) <= 90 && abs($longitude) <= 180
            ? ['latitude' => round($latitude, 6), 'longitude' => round($longitude, 6)]
            : null;
    }

    private function ask(string $query): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }
        $request = curl_init($this->url . '?' . $query);
        if ($request === false) {
            return null;
        }
        curl_setopt_array($request, [
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_TIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_RETURNTRANSFER => true,
            // Nominatim asks to be told which app asks.
            CURLOPT_USERAGENT => 'BrassBandManager' . ($this->appUrl === '' ? '' : ' (' . $this->appUrl . ')'),
        ]);
        $answer = curl_exec($request);
        $status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);

        return is_string($answer) && $status === 200 ? $answer : null;
    }
}
