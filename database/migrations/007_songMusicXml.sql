-- Songs domain, model v1.2 (model/songs.dbml).
-- The score of a song as MusicXML, produced from its MuseScore file by the
-- browser that imports it. What the reading mode shows.

ALTER TABLE song
    ADD COLUMN musicXmlPath VARCHAR(255) NULL AFTER midiPath;
