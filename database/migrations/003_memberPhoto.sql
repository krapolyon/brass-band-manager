-- Members domain: the profile photo of a member.
-- Derived from model/members.dbml v1.9. Meaning and rules: model/members.md, "Profile photo".

-- The file is in the storage folder of the app; this is its path there.
-- Empty when the member has no photo.
ALTER TABLE member
    ADD COLUMN photoPath VARCHAR(255) NULL AFTER addressInstructions;
