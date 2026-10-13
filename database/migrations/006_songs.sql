-- Songs domain: songs, parts, aliases of instruments, levels of a member on a song.
-- Derived from model/songs.dbml v1.0. Meaning and rules: model/songs.md.
--
-- Conventions of every table (model/members.md, "Storage conventions"):
--   createdAt, updatedAt, updatedByMemberId   technical trace
--   DATETIME in UTC                           never TIMESTAMP, which stops in 2038
--   utf8mb4_unicode_ci                        text compared without case or accents

-- ---------------------------------------------------------------
-- Song
-- ---------------------------------------------------------------

CREATE TABLE song (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    originalTitle VARCHAR(150) NOT NULL,
    originalArtist VARCHAR(150) NOT NULL,
    -- Empty: the tempo written in the MuseScore file.
    bpm SMALLINT UNSIGNED NULL,
    status ENUM('PROPOSED', 'IN_PROGRESS', 'IN_REPERTOIRE', 'TEMPORARY', 'ABANDONED') NOT NULL DEFAULT 'PROPOSED',
    -- A day typed by whoever manages songs, not the date of the last change of the row.
    versionOn DATE NULL,
    versionNote VARCHAR(1000) NULL,
    clipUrl VARCHAR(255) NULL,
    -- The five files are in the storage folder of the app; these are their paths there.
    clipThumbnailPath VARCHAR(255) NULL,
    -- Digits only, compared exactly.
    discordChannelId VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    coverPath VARCHAR(255) NULL,
    museScorePath VARCHAR(255) NULL,
    midiPath VARCHAR(255) NULL,
    audioPath VARCHAR(255) NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY songNameUnique (name),
    -- One channel per song. Several songs can have none.
    UNIQUE KEY songDiscordChannelUnique (discordChannelId),
    CONSTRAINT songUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    CONSTRAINT songBpmRange CHECK (bpm IS NULL OR bpm BETWEEN 20 AND 400),
    CONSTRAINT songDiscordChannelDigits CHECK (discordChannelId IS NULL OR discordChannelId REGEXP '^[0-9]{17,20}$'),
    -- The thumbnail is the one of the clip: no clip, no thumbnail.
    CONSTRAINT songThumbnailNeedsClip CHECK (clipThumbnailPath IS NULL OR clipUrl IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Parts
-- ---------------------------------------------------------------

CREATE TABLE songPart (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    songId INT UNSIGNED NOT NULL,
    instrumentId INT UNSIGNED NOT NULL,
    pdfPath VARCHAR(255) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    -- One part per instrument and per song at most.
    UNIQUE KEY songPartInstrumentUnique (songId, instrumentId),
    -- Deleting a song deletes its parts. The files are deleted by the app.
    CONSTRAINT songPartSong FOREIGN KEY (songId) REFERENCES song (id) ON DELETE CASCADE,
    -- An instrument that has a part cannot be deleted.
    CONSTRAINT songPartInstrument FOREIGN KEY (instrumentId) REFERENCES instrument (id) ON DELETE RESTRICT,
    CONSTRAINT songPartUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE instrumentAlias (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    instrumentId INT UNSIGNED NOT NULL,
    alias VARCHAR(50) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    -- An alias names one instrument.
    UNIQUE KEY instrumentAliasUnique (alias),
    -- Deleting an instrument deletes its aliases.
    CONSTRAINT instrumentAliasInstrument FOREIGN KEY (instrumentId) REFERENCES instrument (id) ON DELETE CASCADE,
    CONSTRAINT instrumentAliasUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    -- Compared as bytes: the column itself ignores case, which would make this check always true.
    CONSTRAINT instrumentAliasLowercase CHECK (CAST(alias AS BINARY) = CAST(LOWER(alias) AS BINARY))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- What a member says of a song
-- ---------------------------------------------------------------

CREATE TABLE memberSong (
    memberId INT UNSIGNED NOT NULL,
    songId INT UNSIGNED NOT NULL,
    -- Empty: not said.
    masteryLevel TINYINT UNSIGNED NULL,
    enjoymentLevel TINYINT UNSIGNED NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (memberId, songId),
    CONSTRAINT memberSongMember FOREIGN KEY (memberId) REFERENCES member (id) ON DELETE CASCADE,
    CONSTRAINT memberSongSong FOREIGN KEY (songId) REFERENCES song (id) ON DELETE CASCADE,
    CONSTRAINT memberSongUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    CONSTRAINT memberSongMasteryRange CHECK (masteryLevel IS NULL OR masteryLevel BETWEEN 1 AND 5),
    CONSTRAINT memberSongEnjoymentRange CHECK (enjoymentLevel IS NULL OR enjoymentLevel BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
