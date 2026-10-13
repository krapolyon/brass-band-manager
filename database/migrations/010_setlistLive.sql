-- Gigs v1.3: the live setlist. A setlist belongs to a slot of its gig; the
-- members who said yes to that slot follow it live.
-- No setlist exists yet (the screens are not built): gigSlotId can be required at once.

-- The target of the reference below: a slot together with its gig.
ALTER TABLE gigSlot
    ADD UNIQUE KEY gigSlotOfGig (id, gigId);

ALTER TABLE setlist
    ADD COLUMN gigSlotId INT UNSIGNED NOT NULL AFTER gigId,
    -- Filled together while the setlist is live, both empty otherwise.
    ADD COLUMN liveStartedAt DATETIME NULL AFTER description,
    ADD COLUMN livePosition SMALLINT UNSIGNED NULL AFTER liveStartedAt,
    -- The slot is one of the slots of the gig of the setlist. A slot that has
    -- setlists cannot be deleted.
    ADD CONSTRAINT setlistSlotOfGig FOREIGN KEY (gigSlotId, gigId) REFERENCES gigSlot (id, gigId) ON DELETE RESTRICT,
    ADD CONSTRAINT setlistLiveTogether CHECK ((liveStartedAt IS NULL) = (livePosition IS NULL)),
    ADD CONSTRAINT setlistLivePositionPositive CHECK (livePosition IS NULL OR livePosition >= 1);
