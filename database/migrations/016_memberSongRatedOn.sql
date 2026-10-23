-- Songs v1.10 (0.3.2, issue #44): the day a member last set, changed or
-- confirmed their levels on a song (model/songs.md, entry 3, "Asked again
-- after a year"). Personal data, like the two levels: seen by the member
-- only, erased with them, never in an export, never in a log.

ALTER TABLE memberSong
    -- Empty: never rated. Set by the API to the day of the band's clock.
    ADD COLUMN ratedOn DATE NULL AFTER enjoymentLevel;

-- The levels given before this version count from the day they were last
-- saved, so that nobody is asked again before a year. updatedAt is kept as it
-- was: this is not a change made by the member.
UPDATE memberSong
SET ratedOn = DATE(updatedAt), updatedAt = updatedAt
WHERE masteryLevel IS NOT NULL OR enjoymentLevel IS NOT NULL;

-- A day of rating goes with a level, and a level with a day: "emptied with the
-- two levels".
ALTER TABLE memberSong
    ADD CONSTRAINT memberSongRatedOn CHECK ((ratedOn IS NULL) = (masteryLevel IS NULL AND enjoymentLevel IS NULL));
