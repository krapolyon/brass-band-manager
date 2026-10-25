-- 1.0.0: Members v1.27 (model/members.dbml).

-- Issue #51 (pentest): a count of the refusals and requests of each visitor
-- on the public addresses, so that one visitor cannot try without end nor
-- tie up the server. The visitor is known by a keyed hash of their network
-- address and of the kind of count, never by the address itself. A row lasts
-- as long as its window, one hour at most, then is deleted.
--
-- A technical counter that no member edits: no createdAt, updatedAt nor
-- updatedByMemberId (model/members.md, "Storage conventions").
CREATE TABLE requestLimit (
    keyHash BINARY(32) NOT NULL,
    windowEndsAt DATETIME NOT NULL,
    hits INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (keyHash, windowEndsAt),
    KEY requestLimitWindowEndsAt (windowEndsAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
