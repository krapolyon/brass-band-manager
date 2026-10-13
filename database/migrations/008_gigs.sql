-- Gigs domain: gigs, organisers, slots and answers, costumes, setlists.
-- With it: the reminders of the band (Band domain v1.6) and the devices that
-- accepted push notifications (Members domain v1.17).
-- Derived from model/gigs.dbml v1.0. Meaning and rules: model/gigs.md.
-- Conventions of every table: model/members.md, "Storage conventions".

-- ---------------------------------------------------------------
-- Reminders of the band
-- ---------------------------------------------------------------

-- How many days before a gig its two reminders are sent, and from which hour.
-- An empty number of days: this reminder is not sent.
ALTER TABLE band
    ADD COLUMN gigFirstReminderDays TINYINT UNSIGNED NULL DEFAULT 15 AFTER defaultCountryCode,
    ADD COLUMN gigSecondReminderDays TINYINT UNSIGNED NULL DEFAULT 5 AFTER gigFirstReminderDays,
    ADD COLUMN gigReminderHour TINYINT UNSIGNED NOT NULL DEFAULT 18 AFTER gigSecondReminderDays,
    ADD CONSTRAINT bandFirstReminderRange CHECK (gigFirstReminderDays IS NULL OR gigFirstReminderDays BETWEEN 1 AND 90),
    ADD CONSTRAINT bandSecondReminderRange CHECK (gigSecondReminderDays IS NULL OR gigSecondReminderDays BETWEEN 1 AND 90),
    -- The second reminder comes after the first: fewer days before the gig.
    ADD CONSTRAINT bandRemindersOrder CHECK (
        gigFirstReminderDays IS NULL OR gigSecondReminderDays IS NULL OR gigSecondReminderDays < gigFirstReminderDays
    ),
    ADD CONSTRAINT bandReminderHourRange CHECK (gigReminderHour <= 23);

-- ---------------------------------------------------------------
-- Devices that accepted push notifications
-- ---------------------------------------------------------------

CREATE TABLE pushSubscription (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    memberSessionId INT UNSIGNED NOT NULL,
    -- The three values the browser gives. Compared exactly, never sent back to the front.
    endpoint VARCHAR(500) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    p256dhKey VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    authKey VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    -- One subscription per signed-in device.
    UNIQUE KEY pushSubscriptionSessionUnique (memberSessionId),
    UNIQUE KEY pushSubscriptionEndpointUnique (endpoint),
    -- Signing a device out ends its notifications.
    CONSTRAINT pushSubscriptionSession FOREIGN KEY (memberSessionId) REFERENCES memberSession (id) ON DELETE CASCADE,
    CONSTRAINT pushSubscriptionUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Costumes
-- ---------------------------------------------------------------

CREATE TABLE costume (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(40) NOT NULL,
    -- In the storage folder of the app; this is its path there.
    imagePath VARCHAR(255) NULL,
    position SMALLINT UNSIGNED NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY costumeNameUnique (name),
    CONSTRAINT costumeNameNotBlank CHECK (TRIM(name) <> ''),
    CONSTRAINT costumeUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Gig
-- ---------------------------------------------------------------

CREATE TABLE gig (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    status ENUM('DRAFT', 'PROPOSED', 'ACCEPTED', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    startsOn DATE NOT NULL,
    -- Empty: a gig of one day.
    endsOn DATE NULL,
    -- On the clock of the place: no time zone.
    meetingTime TIME NULL,
    placeName VARCHAR(80) NULL,
    placeUrl VARCHAR(500) NULL,
    streetAddress VARCHAR(200) NULL,
    postalCode VARCHAR(12) NULL,
    city VARCHAR(80) NULL,
    -- Decimal degrees, six decimals: about ten centimetres.
    latitude DECIMAL(8, 6) NULL,
    longitude DECIMAL(9, 6) NULL,
    notes VARCHAR(4000) NULL,
    -- Digits only, compared exactly.
    discordChannelId VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    -- Last reminder sent, by the app or by the button. In UTC.
    remindedAt DATETIME NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    -- The list reads the gigs to come by date.
    KEY gigStartsOn (startsOn),
    -- One channel per gig. Several gigs can have none.
    UNIQUE KEY gigDiscordChannelUnique (discordChannelId),
    CONSTRAINT gigUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    CONSTRAINT gigNameNotBlank CHECK (TRIM(name) <> ''),
    CONSTRAINT gigEndsAfterStart CHECK (endsOn IS NULL OR endsOn >= startsOn),
    -- The two coordinates together, or neither.
    CONSTRAINT gigCoordinatesTogether CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT gigLatitudeRange CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT gigLongitudeRange CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT gigDiscordChannelDigits CHECK (discordChannelId IS NULL OR discordChannelId REGEXP '^[0-9]{17,20}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gigOrganizer (
    gigId INT UNSIGNED NOT NULL,
    memberId INT UNSIGNED NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (gigId, memberId),
    CONSTRAINT gigOrganizerGig FOREIGN KEY (gigId) REFERENCES gig (id) ON DELETE CASCADE,
    -- A member who organised a gig already played stays on it.
    CONSTRAINT gigOrganizerMember FOREIGN KEY (memberId) REFERENCES member (id) ON DELETE RESTRICT,
    CONSTRAINT gigOrganizerUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gigCostume (
    gigId INT UNSIGNED NOT NULL,
    costumeId INT UNSIGNED NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (gigId, costumeId),
    CONSTRAINT gigCostumeGig FOREIGN KEY (gigId) REFERENCES gig (id) ON DELETE CASCADE,
    -- A costume used by a gig cannot be deleted.
    CONSTRAINT gigCostumeCostume FOREIGN KEY (costumeId) REFERENCES costume (id) ON DELETE RESTRICT,
    CONSTRAINT gigCostumeUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Slots and answers
-- ---------------------------------------------------------------

CREATE TABLE gigSlot (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    gigId INT UNSIGNED NOT NULL,
    -- Empty for the only slot of a gig.
    name VARCHAR(40) NULL,
    position SMALLINT UNSIGNED NOT NULL,
    note VARCHAR(1000) NULL,
    costumeId INT UNSIGNED NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    -- Two slots of a gig do not share a name. Several can have none: the app
    -- asks for a name as soon as a gig has several slots.
    UNIQUE KEY gigSlotNameUnique (gigId, name),
    -- The index of the reference below.
    KEY gigSlotCostume (gigId, costumeId),
    CONSTRAINT gigSlotGig FOREIGN KEY (gigId) REFERENCES gig (id) ON DELETE CASCADE,
    -- The costume of a slot is one of the costumes of its gig. The app empties
    -- it on the slots before it takes a costume off a gig, and deletes the
    -- slots of a gig before the gig.
    CONSTRAINT gigSlotCostumeOfGig FOREIGN KEY (gigId, costumeId) REFERENCES gigCostume (gigId, costumeId) ON DELETE RESTRICT,
    CONSTRAINT gigSlotUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gigSlotAttendance (
    gigSlotId INT UNSIGNED NOT NULL,
    memberId INT UNSIGNED NOT NULL,
    -- No row: the member has not answered.
    answer ENUM('YES', 'NO', 'MAYBE', 'IF_NEEDED') NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (gigSlotId, memberId),
    -- Deleting a slot deletes its answers.
    CONSTRAINT gigSlotAttendanceSlot FOREIGN KEY (gigSlotId) REFERENCES gigSlot (id) ON DELETE CASCADE,
    -- The answers of a member stay: the past gigs keep who played.
    CONSTRAINT gigSlotAttendanceMember FOREIGN KEY (memberId) REFERENCES member (id) ON DELETE RESTRICT,
    CONSTRAINT gigSlotAttendanceUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Setlists
-- ---------------------------------------------------------------

CREATE TABLE setlist (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    gigId INT UNSIGNED NOT NULL,
    -- Given by the app: one more than the highest.
    number INT UNSIGNED NOT NULL,
    description VARCHAR(120) NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY setlistNumberUnique (number),
    -- A gig that has a setlist cannot be deleted: only a draft is, and the app
    -- deletes its setlists first.
    CONSTRAINT setlistGig FOREIGN KEY (gigId) REFERENCES gig (id) ON DELETE RESTRICT,
    CONSTRAINT setlistUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    CONSTRAINT setlistNumberPositive CHECK (number >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE setlistSong (
    setlistId INT UNSIGNED NOT NULL,
    -- Starts at 1. A song can come twice in a setlist, at two positions.
    position SMALLINT UNSIGNED NOT NULL,
    songId INT UNSIGNED NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (setlistId, position),
    CONSTRAINT setlistSongSetlist FOREIGN KEY (setlistId) REFERENCES setlist (id) ON DELETE CASCADE,
    -- A song used by a setlist cannot be deleted.
    CONSTRAINT setlistSongSong FOREIGN KEY (songId) REFERENCES song (id) ON DELETE RESTRICT,
    CONSTRAINT setlistSongUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    CONSTRAINT setlistSongPositionPositive CHECK (position >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
