-- Members v1.21 (0.2.0), with Gigs v1.6 and Songs v1.6.

-- The text size is a setting of the device since 0.1.1 (Members v1.20): no
-- code has read or written this column since then. Its check goes first.
ALTER TABLE member
    DROP CONSTRAINT memberTextSizeStep,
    DROP COLUMN textSizePercent;

-- The notification settings of the account (issue #23): which kinds of
-- notifications the member receives, on every device that accepts them.
-- EMAIL will be added to the list later. Everyone starts with all of them on.
-- The personal calendar address (issue #21): 32 random characters, compared
-- exactly, empty until the member asks for it.
ALTER TABLE member
    ADD COLUMN notifyGigPlayable ENUM('OFF', 'PUSH') NOT NULL DEFAULT 'PUSH' AFTER hasExtendedTimeouts,
    ADD COLUMN notifyGigConfirmed ENUM('OFF', 'PUSH') NOT NULL DEFAULT 'PUSH' AFTER notifyGigPlayable,
    ADD COLUMN notifyLiveSetlist ENUM('OFF', 'PUSH') NOT NULL DEFAULT 'PUSH' AFTER notifyGigConfirmed,
    ADD COLUMN notifySongNew ENUM('OFF', 'PUSH') NOT NULL DEFAULT 'PUSH' AFTER notifyLiveSetlist,
    ADD COLUMN notifySongScore ENUM('OFF', 'PUSH') NOT NULL DEFAULT 'PUSH' AFTER notifySongNew,
    ADD COLUMN notifySongPart ENUM('OFF', 'PUSH') NOT NULL DEFAULT 'PUSH' AFTER notifySongScore,
    ADD COLUMN calendarToken CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER notifySongPart,
    ADD UNIQUE KEY memberCalendarTokenUnique (calendarToken),
    ADD CONSTRAINT memberCalendarTokenFormat CHECK (calendarToken IS NULL OR calendarToken REGEXP '^[0-9a-f]{32}$');
