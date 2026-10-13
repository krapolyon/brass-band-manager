<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Storage\Images;

// The clip of a song: reading the address of a YouTube video, and fetching
// its thumbnail so that the app serves it itself. Rules: model/songs.md,
// "Clip".
//
// A thumbnail shown straight from YouTube would report every member who
// opens a song. The server fetches it once, when the address is saved.
//
// The server only ever asks the addresses written below (or in the
// configuration, for the local tests), for an identifier it has checked: the
// address a member typed is never fetched.
final class ClipThumbnails
{
    private const HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];

    // The large thumbnail first; older videos only have the small one. Both
    // have the shape of the video, without black bars.
    private const ADDRESSES = [
        'https://i.ytimg.com/vi/{id}/maxresdefault.jpg',
        'https://i.ytimg.com/vi/{id}/mqdefault.jpg',
    ];

    private const MAX_BYTES = 1_000_000;
    private const TIMEOUT_SECONDS = 5;

    /** @var list<string> */
    private readonly array $addresses;

    /**
     * @param array{clipThumbnailUrls?: list<string>} $config
     */
    public function __construct(array $config)
    {
        $this->addresses = $config['clipThumbnailUrls'] ?? self::ADDRESSES;
    }

    // The identifier of the video an address shows, or null when the address
    // is not one YouTube gives for a video.
    public static function videoId(string $url): ?string
    {
        $parts = parse_url($url);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || !in_array(strtolower($parts['host'] ?? ''), self::HOSTS, true)) {
            return null;
        }

        if (strtolower($parts['host'] ?? '') === 'youtu.be') {
            $id = ltrim($parts['path'] ?? '', '/');
        } else {
            if (($parts['path'] ?? '') !== '/watch') {
                return null;
            }
            parse_str($parts['query'] ?? '', $query);
            $id = $query['v'] ?? '';
        }

        return is_string($id) && preg_match('/\A[A-Za-z0-9_-]{11}\z/', $id) === 1 ? $id : null;
    }

    /**
     * The thumbnail of a video, or null when it could not be fetched: the
     * clip is saved all the same, and the cover art stands in.
     *
     * @return array{name: string, content: string}|null
     */
    public function fetch(string $videoId): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        foreach ($this->addresses as $address) {
            $image = $this->download(str_replace('{id}', $videoId, $address));
            $read = $image === null ? null : Images::read($image);
            if ($image !== null && $read !== null) {
                return ['name' => "thumbnail.{$read['extension']}", 'content' => $image];
            }
        }

        return null;
    }

    private function download(string $address): ?string
    {
        $request = curl_init($address);
        if ($request === false) {
            return null;
        }
        $content = '';
        curl_setopt_array($request, [
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_TIMEOUT => self::TIMEOUT_SECONDS,
            // Stops as soon as the answer is larger than a thumbnail can be.
            CURLOPT_WRITEFUNCTION => function ($request, string $piece) use (&$content): int {
                $content .= $piece;

                return strlen($content) > self::MAX_BYTES ? -1 : strlen($piece);
            },
        ]);
        $done = curl_exec($request);
        $status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);

        return $done !== false && $status === 200 && $content !== '' ? $content : null;
    }
}
