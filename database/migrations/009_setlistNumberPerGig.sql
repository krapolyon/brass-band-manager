-- Gigs v1.2: a setlist is numbered within its gig (1, 2, 3…), not across the band.
-- No setlist exists yet (the screens are not built): nothing to renumber.

ALTER TABLE setlist
    ADD UNIQUE KEY setlistNumberPerGigUnique (gigId, number),
    DROP INDEX setlistNumberUnique;
