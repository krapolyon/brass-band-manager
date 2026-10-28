-- Members domain v1.14 and Band domain v1.5.
-- Meaning and rules: model/members.md (entries 1 to 3) and model/band.md.

-- The pictogram of a section: a key among those shipped with the app
-- (api/src/Sections/SectionIcons.php). Empty: the generic pictogram.
ALTER TABLE section
    ADD COLUMN icon VARCHAR(20) NULL AFTER position;

-- When the app sent this link by email, for a forgotten password.
-- Empty for a link created by a member manager.
ALTER TABLE memberPasswordLink
    ADD COLUMN emailedAt DATETIME NULL AFTER expiresAt;

-- The accent theme and the country of the band. A band installed before this
-- script gets the first theme, and France: French was the only language then.
ALTER TABLE band
    ADD COLUMN defaultAccentTheme VARCHAR(20) NOT NULL DEFAULT 'copper' AFTER defaultLanguage,
    ADD COLUMN defaultCountryCode CHAR(2) NOT NULL DEFAULT 'FR' AFTER defaultAccentTheme;

-- The defaults above served the existing row only: install gives both values.
ALTER TABLE band
    ALTER COLUMN defaultAccentTheme DROP DEFAULT,
    ALTER COLUMN defaultCountryCode DROP DEFAULT,
    ADD CONSTRAINT bandCountryCodeUppercase CHECK (defaultCountryCode REGEXP '^[A-Z]{2}$');

-- The text size has six steps, 100 to 200 by 20. A value set before is moved
-- to the nearest step.
UPDATE member SET textSizePercent = 100 + 20 * ROUND((textSizePercent - 100) / 20);

ALTER TABLE member
    DROP CONSTRAINT memberTextSizeRange,
    ADD CONSTRAINT memberTextSizeStep CHECK (textSizePercent IN (100, 120, 140, 160, 180, 200));
