-- Members domain: sections, instruments, members, roles, sessions, password links.
-- Derived from model/members.dbml v1.1. Meaning and rules: model/members.md.
--
-- Conventions of every table (model/members.md, "Storage conventions"):
--   createdAt, updatedAt, updatedByMemberId   technical trace
--   DATETIME in UTC                           never TIMESTAMP, which stops in 2038
--   utf8mb4_unicode_ci                        text compared without case or accents

-- ---------------------------------------------------------------
-- Sections and instruments
-- ---------------------------------------------------------------

CREATE TABLE section (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    position SMALLINT UNSIGNED NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY sectionNameUnique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE instrument (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    sectionId INT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    position SMALLINT UNSIGNED NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY instrumentNameUnique (name),
    -- A section that still has instruments cannot be deleted.
    CONSTRAINT instrumentSection FOREIGN KEY (sectionId) REFERENCES section (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Member
-- ---------------------------------------------------------------

CREATE TABLE member (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nickname VARCHAR(50) NOT NULL,
    firstName VARCHAR(50) NOT NULL,
    lastName VARCHAR(50) NOT NULL,
    email VARCHAR(254) NOT NULL,
    mobilePhone VARCHAR(20) NULL,
    streetAddress VARCHAR(200) NULL,
    postalCode VARCHAR(12) NULL,
    city VARCHAR(80) NULL,
    -- Two capital letters, compared exactly.
    countryCode CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NULL,
    addressInstructions VARCHAR(500) NULL,
    instrumentId INT UNSIGNED NOT NULL,
    passwordHash VARCHAR(255) NULL,
    failedSignInCount TINYINT UNSIGNED NOT NULL DEFAULT 0,
    signInLockedUntil DATETIME NULL,
    status ENUM('INVITED', 'ACTIVE', 'POWER_MEMBER', 'LEFT') NOT NULL,
    language VARCHAR(10) NOT NULL,
    colorScheme ENUM('AUTO', 'LIGHT', 'DARK') NOT NULL DEFAULT 'AUTO',
    accentTheme VARCHAR(30) NULL,
    textSizePercent SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    hasHighContrast BOOLEAN NOT NULL DEFAULT FALSE,
    hasIncreasedSpacing BOOLEAN NOT NULL DEFAULT FALSE,
    hasLegibleFont BOOLEAN NOT NULL DEFAULT FALSE,
    hasReducedMotion BOOLEAN NOT NULL DEFAULT FALSE,
    hasExtendedTimeouts BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY memberNicknameUnique (nickname),
    UNIQUE KEY memberEmailUnique (email),
    -- An instrument played by a member cannot be deleted.
    CONSTRAINT memberInstrument FOREIGN KEY (instrumentId) REFERENCES instrument (id) ON DELETE RESTRICT,
    CONSTRAINT memberUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    -- Compared as bytes: the column itself ignores case, which would make this check always true.
    CONSTRAINT memberEmailLowercase CHECK (CAST(email AS BINARY) = CAST(LOWER(email) AS BINARY)),
    CONSTRAINT memberCountryCodeUppercase CHECK (countryCode IS NULL OR countryCode REGEXP '^[A-Z]{2}$'),
    -- A member who can sign in (ACTIVE or POWER_MEMBER) has a password.
    CONSTRAINT memberCurrentHasPassword CHECK (status NOT IN ('ACTIVE', 'POWER_MEMBER') OR passwordHash IS NOT NULL),
    CONSTRAINT memberTextSizeRange CHECK (textSizePercent BETWEEN 100 AND 200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The trace of who changed a section or an instrument points to member,
-- which did not exist yet when those tables were created.
ALTER TABLE section
    ADD CONSTRAINT sectionUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL;

ALTER TABLE instrument
    ADD CONSTRAINT instrumentUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------

CREATE TABLE memberRole (
    memberId INT UNSIGNED NOT NULL,
    role ENUM('ADMIN', 'MEMBER_MANAGER', 'SONG_MANAGER', 'GIG_MANAGER', 'SETLIST_MANAGER', 'QUOTE_MANAGER') NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (memberId, role),
    CONSTRAINT memberRoleMember FOREIGN KEY (memberId) REFERENCES member (id) ON DELETE CASCADE,
    CONSTRAINT memberRoleUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Access: signed-in devices and password links
-- ---------------------------------------------------------------

CREATE TABLE memberSession (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    memberId INT UNSIGNED NOT NULL,
    -- SHA-256 written in hexadecimal: 64 characters, compared exactly.
    tokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    lastUsedAt DATETIME NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY memberSessionTokenHashUnique (tokenHash),
    CONSTRAINT memberSessionMember FOREIGN KEY (memberId) REFERENCES member (id) ON DELETE CASCADE,
    CONSTRAINT memberSessionUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE memberPasswordLink (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    memberId INT UNSIGNED NOT NULL,
    tokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    -- One pending link per member at most.
    UNIQUE KEY memberPasswordLinkMemberUnique (memberId),
    UNIQUE KEY memberPasswordLinkTokenHashUnique (tokenHash),
    CONSTRAINT memberPasswordLinkMember FOREIGN KEY (memberId) REFERENCES member (id) ON DELETE CASCADE,
    CONSTRAINT memberPasswordLinkUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
