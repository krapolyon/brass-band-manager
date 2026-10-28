-- Band domain: the band this instance belongs to, and its settings.
-- Derived from model/band.dbml v1.0. Meaning and rules: model/band.md.
-- Conventions of every table: model/members.md, "Storage conventions".

CREATE TABLE band (
    id TINYINT UNSIGNED NOT NULL,
    name VARCHAR(80) NOT NULL,
    logoPath VARCHAR(255) NULL,
    defaultLanguage VARCHAR(10) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    -- The table holds a single row: the only id accepted is 1.
    CONSTRAINT bandSingleRow CHECK (id = 1),
    CONSTRAINT bandNameNotBlank CHECK (TRIM(name) <> ''),
    CONSTRAINT bandUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
