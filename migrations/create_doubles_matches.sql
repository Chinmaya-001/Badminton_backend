-- ================================================
-- DOUBLES MATCHES TABLES
-- ================================================

-- Main doubles matches table
CREATE TABLE doubles_matches (
    id SERIAL PRIMARY KEY,

    -- Team 1: two players
    team1_player1_id INTEGER NOT NULL REFERENCES players(id),
    team1_player2_id INTEGER NOT NULL REFERENCES players(id),

    -- Team 2: two players
    team2_player1_id INTEGER NOT NULL REFERENCES players(id),
    team2_player2_id INTEGER NOT NULL REFERENCES players(id),

    referee_id INTEGER REFERENCES referees(id),
    court VARCHAR(100),
    scheduled_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED')),

    number_of_sets INTEGER NOT NULL DEFAULT 3
        CHECK (number_of_sets IN (1, 3, 5)),

    -- 1 = Team 1 won, 2 = Team 2 won, NULL = not yet completed
    winning_team INTEGER CHECK (winning_team IN (1, 2)),

    -- Live scoring state
    current_set INTEGER NOT NULL DEFAULT 1,
    current_team1_score INTEGER NOT NULL DEFAULT 0,
    current_team2_score INTEGER NOT NULL DEFAULT 0,

    created_by_admin_id INTEGER REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- All 4 players must be different
    CONSTRAINT all_players_different CHECK (
        team1_player1_id != team1_player2_id
        AND team1_player1_id != team2_player1_id
        AND team1_player1_id != team2_player2_id
        AND team1_player2_id != team2_player1_id
        AND team1_player2_id != team2_player2_id
        AND team2_player1_id != team2_player2_id
    )
);

-- Doubles match sets table
CREATE TABLE doubles_match_sets (
    id SERIAL PRIMARY KEY,
    doubles_match_id INTEGER NOT NULL REFERENCES doubles_matches(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL,
    team1_score INTEGER NOT NULL,
    team2_score INTEGER NOT NULL,

    UNIQUE (doubles_match_id, set_number)
);
