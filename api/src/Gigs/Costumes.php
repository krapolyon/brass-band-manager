<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Positions;
use Doctrine\DBAL\Connection;

// What the actions on costumes share: how they are listed and ordered.
// Rules: model/gigs.md, entry 3.
final class Costumes
{
    public const NAME_MAX_LENGTH = 40;

    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * The costumes of the band, in its order.
     *
     * gigCount is how many gigs have the costume, the gigs already played
     * included: a costume a gig has cannot be deleted.
     *
     * @return list<array{id: int, name: string, position: int, pictureUrl: string|null, gigCount: int}>
     */
    public function all(): array
    {
        return array_map(
            fn (array $costume) => [
                'id' => (int) $costume['id'],
                'name' => (string) $costume['name'],
                'position' => (int) $costume['position'],
                'pictureUrl' => CostumePictures::url((int) $costume['id'], $costume['imagePath']),
                'gigCount' => (int) $costume['gigCount'],
            ],
            $this->database->fetchAllAssociative(
                'SELECT c.id, c.name, c.position, c.imagePath,
                        (SELECT COUNT(*) FROM gigCostume g WHERE g.costumeId = c.id) AS gigCount
                 FROM costume c ORDER BY c.position, c.name',
            ),
        );
    }

    // Puts a costume at a place in the list (1 is the first) and numbers the
    // whole list again from 1.
    public function place(int $costumeId, int $position, int $byMemberId): void
    {
        Positions::place($this->database, 'costume', '1 = 1', [], 'name', $costumeId, $position, $byMemberId);
    }
}
