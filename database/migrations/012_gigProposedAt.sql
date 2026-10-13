-- Gigs v1.4: the instant a gig first reaches a status members see (PROPOSED,
-- ACCEPTED or CONFIRMED). Set once by the API and never changed afterwards,
-- even when the gig is cancelled then reopened. The home screen reads it to
-- mark a gig as new for 15 days. Stored in UTC, like remindedAt.

ALTER TABLE gig
    ADD COLUMN proposedAt DATETIME NULL AFTER remindedAt;

-- The gigs that already left the draft take the instant they were created.
UPDATE gig
SET proposedAt = createdAt, updatedAt = updatedAt
WHERE status <> 'DRAFT';
