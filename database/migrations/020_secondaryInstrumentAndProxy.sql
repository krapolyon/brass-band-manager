-- Members v1.34, Gigs v1.15 (1.1.0): a secondary instrument a member can
-- bring to a gig, and the one member who may answer gigs for another
-- (model/members.md, "A secondary instrument" and "Answering for the member
-- who designated me"; model/gigs.md, "Coming with the other instrument").

ALTER TABLE member
    -- A second instrument; empty for most members. The section stays the one
    -- of instrumentId. An instrument held this way cannot be deleted.
    ADD COLUMN secondaryInstrumentId INT UNSIGNED NULL AFTER instrumentId,
    -- The member who may answer gigs for this one ("Peut répondre pour moi").
    -- Never oneself: checked by the API (MySQL cannot compare with an
    -- AUTO_INCREMENT column in a CHECK).
    ADD COLUMN proxyMemberId INT UNSIGNED NULL AFTER secondaryInstrumentId,
    ADD CONSTRAINT memberSecondaryInstrument FOREIGN KEY (secondaryInstrumentId) REFERENCES instrument (id) ON DELETE RESTRICT,
    ADD CONSTRAINT memberProxy FOREIGN KEY (proxyMemberId) REFERENCES member (id) ON DELETE SET NULL,
    ADD CONSTRAINT memberSecondaryNotInstrument CHECK (secondaryInstrumentId IS NULL OR secondaryInstrumentId <> instrumentId);

ALTER TABLE gigSlotAttendance
    -- The instrument the member comes with, when it is their secondary one.
    -- Empty: the instrument of the member. An instrument deleted later leaves
    -- the answer with the instrument of the member.
    ADD COLUMN instrumentId INT UNSIGNED NULL AFTER answer,
    ADD CONSTRAINT gigSlotAttendanceInstrument FOREIGN KEY (instrumentId) REFERENCES instrument (id) ON DELETE SET NULL;
