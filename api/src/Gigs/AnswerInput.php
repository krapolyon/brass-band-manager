<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

final class AnswerInput
{
    public function __construct(public readonly AttendanceAnswer $answer)
    {
    }
}
