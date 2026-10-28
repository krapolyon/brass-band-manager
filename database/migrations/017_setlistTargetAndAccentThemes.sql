-- 0.4.0: Band v1.9 and Members v1.26 (model/band.dbml, model/members.dbml).

-- Band v1.9 (issue #60): the length of a setlist the generator proposes
-- first, in minutes, from 5 to 180 by steps of 5.
ALTER TABLE band
    ADD COLUMN setlistTargetMinutes INT NOT NULL DEFAULT 45 AFTER discordServerId,
    ADD CONSTRAINT bandSetlistTargetRange
        CHECK (setlistTargetMinutes BETWEEN 5 AND 180 AND setlistTargetMinutes % 5 = 0);

-- Band v1.9 and Members v1.26 (issue #58): ten accent themes. Four of them
-- replace the four themes of before, and a key stored before moves to its new
-- name. A row that holds none of the old keys is left as it is, so the script
-- can run on any instance. updatedAt is kept: this is not a change made by a
-- member.
UPDATE band
SET defaultAccentTheme = CASE defaultAccentTheme
        WHEN 'copper' THEN 'brass'
        WHEN 'coral' THEN 'tangerine'
        WHEN 'mint' THEN 'lagoon'
        WHEN 'lilac' THEN 'orchid'
    END,
    updatedAt = updatedAt
WHERE defaultAccentTheme IN ('copper', 'coral', 'mint', 'lilac');

UPDATE member
SET accentTheme = CASE accentTheme
        WHEN 'copper' THEN 'brass'
        WHEN 'coral' THEN 'tangerine'
        WHEN 'mint' THEN 'lagoon'
        WHEN 'lilac' THEN 'orchid'
    END,
    updatedAt = updatedAt
WHERE accentTheme IN ('copper', 'coral', 'mint', 'lilac');

-- The first theme of the list is the default of the column.
ALTER TABLE band
    ALTER COLUMN defaultAccentTheme SET DEFAULT 'brass';

-- Members v1.26 (owner, 2026-10-24): a new member starts in the dark scheme.
-- The members already there keep their choice.
ALTER TABLE member
    ALTER COLUMN colorScheme SET DEFAULT 'DARK';
