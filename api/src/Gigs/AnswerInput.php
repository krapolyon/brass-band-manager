<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

final class AnswerInput
{
    /**
     * @param int|null $instrumentId The instrument the member comes with
     *                               (1.1.0): their own or their secondary one; null: their own
     */
    public function __construct(
        public readonly AttendanceAnswer $answer,
        public readonly ?int $instrumentId = null,
    ) {
    }
}
