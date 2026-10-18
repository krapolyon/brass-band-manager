-- 0.3.0: Band v1.9 (band.dbml v1.8), Members v1.22, Songs v1.8, Gigs v1.7.
-- The Discord server of the band and the role of each section (issue #33),
-- the channel of each notification (issue #27), the icon of the installed
-- app (issue #34), what the setlist generator reads (issue #25).
-- Only additions to member, which sign-in reads (docs/architecture.md,
-- "Not locking oneself out"). Meaning and rules: model/.
-- Conventions of every table: model/members.md, "Storage conventions".

-- ---------------------------------------------------------------
-- Band
-- ---------------------------------------------------------------

-- The second reminder no longer has to come after the first (Band v1.9):
-- two reminders that fall on the same day are sent once.
ALTER TABLE band
    DROP CONSTRAINT bandRemindersOrder;

-- iconPath: the square image the icons of the installed app are made from;
-- empty, they are made from the logo. discordServerId: digits only, compared
-- exactly. setlistGapSeconds: the time counted between two songs.
ALTER TABLE band
    ADD COLUMN iconPath VARCHAR(255) NULL AFTER logoPath,
    ADD COLUMN discordServerId VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER gigReminderHour,
    ADD COLUMN setlistGapSeconds SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER discordServerId,
    ADD CONSTRAINT bandDiscordServerDigits CHECK (discordServerId IS NULL OR discordServerId REGEXP '^[0-9]{17,20}$'),
    ADD CONSTRAINT bandSetlistGapRange CHECK (setlistGapSeconds <= 300);

-- ---------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------

-- The Discord role that tags a section, chosen among the roles of the server.
ALTER TABLE section
    ADD COLUMN discordRoleId VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER icon,
    ADD UNIQUE KEY sectionDiscordRoleUnique (discordRoleId),
    ADD CONSTRAINT sectionDiscordRoleDigits CHECK (discordRoleId IS NULL OR discordRoleId REGEXP '^[0-9]{17,20}$');

-- Each notification by push, email or both (issue #27). The values that
-- exist stay what they were. The reminders to answer become a setting, never
-- OFF; the live setlist is never sent by email (both checked by the API, the
-- first by the database too).
ALTER TABLE member
    MODIFY COLUMN notifyGigPlayable ENUM('OFF', 'PUSH', 'EMAIL', 'PUSH_AND_EMAIL') NOT NULL DEFAULT 'PUSH',
    MODIFY COLUMN notifyGigConfirmed ENUM('OFF', 'PUSH', 'EMAIL', 'PUSH_AND_EMAIL') NOT NULL DEFAULT 'PUSH',
    MODIFY COLUMN notifyLiveSetlist ENUM('OFF', 'PUSH', 'EMAIL', 'PUSH_AND_EMAIL') NOT NULL DEFAULT 'PUSH',
    MODIFY COLUMN notifySongNew ENUM('OFF', 'PUSH', 'EMAIL', 'PUSH_AND_EMAIL') NOT NULL DEFAULT 'PUSH',
    MODIFY COLUMN notifySongScore ENUM('OFF', 'PUSH', 'EMAIL', 'PUSH_AND_EMAIL') NOT NULL DEFAULT 'PUSH',
    MODIFY COLUMN notifySongPart ENUM('OFF', 'PUSH', 'EMAIL', 'PUSH_AND_EMAIL') NOT NULL DEFAULT 'PUSH',
    ADD COLUMN notifyGigReminder ENUM('OFF', 'PUSH', 'EMAIL', 'PUSH_AND_EMAIL') NOT NULL DEFAULT 'PUSH' AFTER hasExtendedTimeouts,
    ADD CONSTRAINT memberGigReminderNeverOff CHECK (notifyGigReminder <> 'OFF'),
    ADD CONSTRAINT memberLiveSetlistPushOnly CHECK (notifyLiveSetlist IN ('OFF', 'PUSH'));

-- ---------------------------------------------------------------
-- Songs
-- ---------------------------------------------------------------

-- durationSeconds: how long the band plays it. inRepertoireOn: the day it
-- entered the repertoire; empty for the songs of before 0.3.0, filled by hand
-- (the import kit of the owner). setCategory and isNeverFirst: where the
-- setlist generator may place it.
ALTER TABLE song
    ADD COLUMN durationSeconds SMALLINT UNSIGNED NULL AFTER discordChannelId,
    ADD COLUMN inRepertoireOn DATE NULL AFTER durationSeconds,
    ADD COLUMN setCategory ENUM('OPENER', 'PARTY', 'KNOWN', 'CHOREOGRAPHY', 'CHILL', 'ENCORE', 'STANDARD') NOT NULL DEFAULT 'STANDARD' AFTER inRepertoireOn,
    ADD COLUMN isNeverFirst BOOLEAN NOT NULL DEFAULT FALSE AFTER setCategory,
    ADD CONSTRAINT songDurationRange CHECK (durationSeconds IS NULL OR durationSeconds BETWEEN 10 AND 1200);

-- A category a song can also serve as. Never STANDARD (checked here), never
-- the main category of the song (checked by the API: MySQL cannot compare
-- with another table in a check).
CREATE TABLE songOtherCategory (
    songId INT UNSIGNED NOT NULL,
    category ENUM('OPENER', 'PARTY', 'KNOWN', 'CHOREOGRAPHY', 'CHILL', 'ENCORE', 'STANDARD') NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (songId, category),
    CONSTRAINT songOtherCategorySong FOREIGN KEY (songId) REFERENCES song (id) ON DELETE CASCADE,
    CONSTRAINT songOtherCategoryUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    CONSTRAINT songOtherCategoryNotStandard CHECK (category <> 'STANDARD')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A section for which the song is tiring: never in the second half of a set.
-- Deleting a section, or the song, deletes the row.
CREATE TABLE songTiringSection (
    songId INT UNSIGNED NOT NULL,
    sectionId INT UNSIGNED NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (songId, sectionId),
    CONSTRAINT songTiringSectionSong FOREIGN KEY (songId) REFERENCES song (id) ON DELETE CASCADE,
    CONSTRAINT songTiringSectionSection FOREIGN KEY (sectionId) REFERENCES section (id) ON DELETE CASCADE,
    CONSTRAINT songTiringSectionUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A section for which the song is tricky ("ça tricote"): two songs tricky for
-- the same section never follow each other.
CREATE TABLE songTrickySection (
    songId INT UNSIGNED NOT NULL,
    sectionId INT UNSIGNED NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (songId, sectionId),
    CONSTRAINT songTrickySectionSong FOREIGN KEY (songId) REFERENCES song (id) ON DELETE CASCADE,
    CONSTRAINT songTrickySectionSection FOREIGN KEY (sectionId) REFERENCES section (id) ON DELETE CASCADE,
    CONSTRAINT songTrickySectionUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
