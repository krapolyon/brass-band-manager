-- Songs v1.4: the phrases the dictation of a setlist learned for a song.
-- A phrase is cleaned by the API before it is saved (lowercase, no accents,
-- letters said one by one joined, one space between words). 20 per song at
-- most: the API drops the oldest when a 21st is learned.

CREATE TABLE songSpokenName (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    songId INT UNSIGNED NOT NULL,
    phrase VARCHAR(60) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedByMemberId INT UNSIGNED NULL,
    PRIMARY KEY (id),
    -- A phrase names one song: learned for another song, the row moves.
    UNIQUE KEY songSpokenNameUnique (phrase),
    KEY songSpokenNameOfSong (songId, createdAt),
    -- Deleting a song deletes its phrases.
    CONSTRAINT songSpokenNameSong FOREIGN KEY (songId) REFERENCES song (id) ON DELETE CASCADE,
    CONSTRAINT songSpokenNameUpdatedBy FOREIGN KEY (updatedByMemberId) REFERENCES member (id) ON DELETE SET NULL,
    CONSTRAINT songSpokenNameLength CHECK (CHAR_LENGTH(phrase) BETWEEN 2 AND 60)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
