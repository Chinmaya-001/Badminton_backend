ALTER TABLE rating_history
    ALTER COLUMN match_id DROP NOT NULL;

ALTER TABLE rating_history
    ADD COLUMN doubles_match_id INTEGER
    REFERENCES doubles_matches(id) ON DELETE SET NULL;
