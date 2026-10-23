-- Two changes of 0.3.1: the encryption of members (#32), then the mood and
-- the positions of a song (#47), at the end.
--
-- Members v1.23 (0.3.1, issue #32): the names, email, phone and address of a
-- member are encrypted in the database (model/members.md, entry 1,
-- "Encryption"). Each one stays in its own column, which now holds
-- "v1:" + base64 of the encrypted value: about four thirds of the value plus
-- 43 characters. The columns are widened to hold the longest value their
-- field accepts (counted at four bytes per character), encrypted.
--
-- This script cannot encrypt: the key is in config.php. The rows that exist
-- are encrypted by the database update itself, right after this script
-- (api/src/Members/PersonalData.php, sealExisting). Until then they are read
-- in clear, so that sign-in keeps working ("Not locking oneself out",
-- docs/architecture.md): on member, this script only widens columns, adds
-- emailHash and drops the checks a value encrypted cannot pass.

ALTER TABLE member
    -- What an encrypted value cannot pass: it is no longer in lowercase, nor
    -- two capital letters. The rules stay, checked by the API before the value
    -- is encrypted.
    DROP CHECK memberEmailLowercase,
    DROP CHECK memberCountryCodeUppercase,
    -- An encrypted email is never twice the same: its uniqueness is held by
    -- emailHash. (An index on the widened column would be too long anyway.)
    DROP INDEX memberEmailUnique,
    MODIFY firstName VARCHAR(330) NOT NULL,
    MODIFY lastName VARCHAR(330) NOT NULL,
    MODIFY email VARCHAR(1420) NOT NULL,
    MODIFY mobilePhone VARCHAR(170) NULL,
    MODIFY streetAddress VARCHAR(1130) NULL,
    MODIFY postalCode VARCHAR(130) NULL,
    MODIFY city VARCHAR(490) NULL,
    MODIFY countryCode VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    MODIFY addressInstructions VARCHAR(2730) NULL,
    -- The HMAC-SHA256 of the email in lowercase, in hexadecimal: what sign-in,
    -- the forgotten password and the uniqueness of the email compare. Empty
    -- only for a row not encrypted yet; required in the next release, once
    -- every row has it.
    ADD COLUMN emailHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER email,
    ADD UNIQUE KEY memberEmailHashUnique (emailHash);

-- Songs v1.9 (0.3.1, issue #47): the mood of a song and the places a set can
-- give it replace its categories, "can also be" and "never first"
-- (model/songs.md, "Setlist attributes"). The owner confirmed that no song
-- had a category or "never first" filled: nothing is carried over.

ALTER TABLE song
    -- Chill, Médium, Teuf: a preference of the setlist generator.
    ADD COLUMN mood ENUM('CHILL', 'MEDIUM', 'PARTY') NOT NULL DEFAULT 'MEDIUM' AFTER inRepertoireOn,
    -- The authors and composers, as the collecting society knows them.
    ADD COLUMN copyright VARCHAR(200) NULL AFTER originalArtist,
    DROP COLUMN setCategory,
    DROP COLUMN isNeverFirst;

DROP TABLE songOtherCategory;

-- A place of a set where the song can be played. A song has at least one
-- (checked by the API: a table cannot require a row in another).
CREATE TABLE songPosition (
    songId INT UNSIGNED NOT NULL,
    position ENUM('START', 'FIRST_HALF', 'MIDDLE', 'SECOND_HALF', 'END') NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (songId, position),
    CONSTRAINT songPositionSong FOREIGN KEY (songId) REFERENCES song (id) ON DELETE CASCADE,
    CONSTRAINT songPositionUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every song that exists gets the three places of a new song.
INSERT INTO songPosition (songId, position)
SELECT song.id, places.position
FROM song
CROSS JOIN (
    SELECT 'FIRST_HALF' AS position
    UNION ALL SELECT 'MIDDLE'
    UNION ALL SELECT 'SECOND_HALF'
) AS places;
