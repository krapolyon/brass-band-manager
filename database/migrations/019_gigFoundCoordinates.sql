-- Gigs v1.13 (1.1.0): the coordinates of a gig found from its address by a
-- geocoding service, when none are typed, so that its map shows
-- (model/gigs.md, "Coordinates found from the address").

ALTER TABLE gig
    -- True when latitude and longitude were found from the address by the
    -- app, false when typed. The coordinates saved before are typed ones.
    ADD COLUMN hasFoundCoordinates BOOLEAN NOT NULL DEFAULT FALSE AFTER longitude;

-- Found coordinates exist only with coordinates.
ALTER TABLE gig
    ADD CONSTRAINT gigFoundCoordinates CHECK (hasFoundCoordinates = FALSE OR latitude IS NOT NULL);
