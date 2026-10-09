-- Add number_of_sets column to matches table
-- Allowed values: 1, 3, 5 (defaults to 3 for standard best-of-3 badminton)

ALTER TABLE matches
ADD COLUMN number_of_sets INTEGER NOT NULL DEFAULT 3;

-- Add a check constraint to ensure only valid values
ALTER TABLE matches
ADD CONSTRAINT chk_number_of_sets
CHECK (number_of_sets IN (1, 3, 5));
