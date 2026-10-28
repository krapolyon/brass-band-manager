-- Members domain v1.15.
-- Meaning and rules: model/members.md, entry 3 ("An invitation tolerates ten refusals").

-- How many times the record sent with this link was refused because a
-- nickname or an email is taken. At ten, the link is deleted.
ALTER TABLE memberPasswordLink
    ADD COLUMN refusedCount TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER emailedAt;
