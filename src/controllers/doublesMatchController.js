const pool = require("../config/database");

const {
    calculateRatingChange
} = require("../utils/elo");

const {
    validateSetScore
} = require("../utils/badminton");


// ================================================
// HELPER: FORMAT DOUBLES MATCH OBJECT
// ================================================

const formatDoublesMatch = (row, sets = null) => {
    const formatted = {
        id: Number(row.id),
        status: row.status,
        court: row.court || null,
        numberOfSets: Number(row.number_of_sets),
        winningTeam: row.winning_team ? Number(row.winning_team) : null,
        currentSet: row.current_set ? Number(row.current_set) : 1,
        currentTeam1Score: row.current_team1_score !== undefined ? Number(row.current_team1_score) : 0,
        currentTeam2Score: row.current_team2_score !== undefined ? Number(row.current_team2_score) : 0,
        scheduledAt: row.scheduled_at,
        startedAt: row.started_at || null,
        completedAt: row.completed_at || null,
        createdAt: row.created_at || null,
        referee: row.referee_id ? {
            id: Number(row.referee_id),
            name: row.referee_name || null
        } : null,
        team1: {
            player1: {
                id: Number(row.team1_player1_id),
                name: row.team1_player1_name,
                rating: Number(row.team1_player1_rating),
                rank: row.team1_player1_rank ? Number(row.team1_player1_rank) : null
            },
            player2: {
                id: Number(row.team1_player2_id),
                name: row.team1_player2_name,
                rating: Number(row.team1_player2_rating),
                rank: row.team1_player2_rank ? Number(row.team1_player2_rank) : null
            }
        },
        team2: {
            player1: {
                id: Number(row.team2_player1_id),
                name: row.team2_player1_name,
                rating: Number(row.team2_player1_rating),
                rank: row.team2_player1_rank ? Number(row.team2_player1_rank) : null
            },
            player2: {
                id: Number(row.team2_player2_id),
                name: row.team2_player2_name,
                rating: Number(row.team2_player2_rating),
                rank: row.team2_player2_rank ? Number(row.team2_player2_rank) : null
            }
        }
    };

    if (sets !== null) {
        formatted.sets = sets;
    }

    return formatted;
};


// ================================================
// CREATE DOUBLES MATCH (Admin)
// ================================================

const createDoublesMatch = async (req, res) => {
    try {
        const adminId = req.user.id;

        const {
            team1Player1Id,
            team1Player2Id,
            team2Player1Id,
            team2Player2Id,
            refereeId,
            court,
            scheduledAt,
            numberOfSets
        } = req.body;

        if (
            !team1Player1Id ||
            !team1Player2Id ||
            !team2Player1Id ||
            !team2Player2Id ||
            !scheduledAt
        ) {
            return res.status(400).json({
                success: false,
                message: "team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id and scheduledAt are required"
            });
        }

        const setsToPlay = numberOfSets ? Number(numberOfSets) : 3;

        if (![1, 3, 5].includes(setsToPlay)) {
            return res.status(400).json({
                success: false,
                message: "numberOfSets must be 1, 3, or 5"
            });
        }

        const playerIds = [
            Number(team1Player1Id),
            Number(team1Player2Id),
            Number(team2Player1Id),
            Number(team2Player2Id)
        ];

        const uniqueIds = new Set(playerIds);

        if (uniqueIds.size !== 4) {
            return res.status(400).json({
                success: false,
                message: "All 4 players must be different"
            });
        }

        const playersResult = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT id, name, rating, rank
            FROM ranked_players
            WHERE id IN ($1, $2, $3, $4)`,
            [
                team1Player1Id,
                team1Player2Id,
                team2Player1Id,
                team2Player2Id
            ]
        );

        if (playersResult.rows.length !== 4) {
            return res.status(404).json({
                success: false,
                message: "One or more players not found or not approved"
            });
        }

        const adminResult = await pool.query(
            `SELECT id, name
             FROM admins
             WHERE id = $1
             AND is_active = TRUE`,
            [adminId]
        );

        if (adminResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Admin not found or inactive"
            });
        }

        let refereeName = null;
        if (refereeId) {
            const refereeResult = await pool.query(
                `SELECT id, name
                 FROM referees
                 WHERE id = $1
                 AND is_active = TRUE`,
                [refereeId]
            );

            if (refereeResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Referee not found or inactive"
                });
            }
            refereeName = refereeResult.rows[0].name;
        }

        const result = await pool.query(
            `INSERT INTO doubles_matches
            (
                team1_player1_id,
                team1_player2_id,
                team2_player1_id,
                team2_player2_id,
                referee_id,
                court,
                scheduled_at,
                status,
                created_by_admin_id,
                number_of_sets
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8, $9)
            RETURNING *`,
            [
                team1Player1Id,
                team1Player2Id,
                team2Player1Id,
                team2Player2Id,
                refereeId || null,
                court || null,
                scheduledAt,
                adminId,
                setsToPlay
            ]
        );

        const playerMap = {};
        playersResult.rows.forEach(p => {
            playerMap[Number(p.id)] = p;
        });

        const createdMatch = result.rows[0];

        const matchResponse = formatDoublesMatch({
            ...createdMatch,
            referee_name: refereeName,
            team1_player1_name: playerMap[Number(team1Player1Id)].name,
            team1_player1_rating: playerMap[Number(team1Player1Id)].rating,
            team1_player1_rank: playerMap[Number(team1Player1Id)].rank,

            team1_player2_name: playerMap[Number(team1Player2Id)].name,
            team1_player2_rating: playerMap[Number(team1Player2Id)].rating,
            team1_player2_rank: playerMap[Number(team1Player2Id)].rank,

            team2_player1_name: playerMap[Number(team2Player1Id)].name,
            team2_player1_rating: playerMap[Number(team2Player1Id)].rating,
            team2_player1_rank: playerMap[Number(team2Player1Id)].rank,

            team2_player2_name: playerMap[Number(team2Player2Id)].name,
            team2_player2_rating: playerMap[Number(team2Player2Id)].rating,
            team2_player2_rank: playerMap[Number(team2Player2Id)].rank
        });

        res.status(201).json({
            success: true,
            message: "Doubles match scheduled successfully",
            match: matchResponse
        });

    } catch (error) {
        console.error("Create doubles match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create doubles match"
        });
    }
};


// ================================================
// GET DOUBLES MATCH BY ID
// ================================================

const getDoublesMatchById = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             WHERE dm.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Doubles match not found"
            });
        }

        const matchRow = result.rows[0];

        const setsResult = await pool.query(
            `SELECT
                set_number,
                team1_score,
                team2_score
             FROM doubles_match_sets
             WHERE doubles_match_id = $1
             ORDER BY set_number ASC`,
            [id]
        );

        const sets = setsResult.rows.map(s => ({
            setNumber: Number(s.set_number),
            team1Score: Number(s.team1_score),
            team2Score: Number(s.team2_score)
        }));

        res.status(200).json({
            success: true,
            match: formatDoublesMatch(matchRow, sets)
        });

    } catch (error) {
        console.error("Get doubles match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get doubles match"
        });
    }
};


// ================================================
// GET ALL DOUBLES MATCHES (Admin)
// ================================================

const getAllDoublesMatches = async (req, res) => {
    try {
        const result = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             ORDER BY dm.scheduled_at DESC`
        );

        const matches = result.rows.map(row => formatDoublesMatch(row));

        res.status(200).json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {
        console.error("Get all doubles matches error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get doubles matches"
        });
    }
};


// ================================================
// GET PLAYER'S DOUBLES MATCHES
// ================================================

const getPlayerDoublesMatches = async (req, res) => {
    try {
        const { playerId } = req.params;

        const result = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             WHERE dm.team1_player1_id = $1
                OR dm.team1_player2_id = $1
                OR dm.team2_player1_id = $1
                OR dm.team2_player2_id = $1

             ORDER BY dm.created_at DESC`,
            [playerId]
        );

        const matches = result.rows.map(row => formatDoublesMatch(row));

        res.status(200).json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {
        console.error("Get player doubles matches error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get player doubles matches"
        });
    }
};


// ================================================
// SUBMIT DOUBLES MATCH RESULT
// ================================================

const submitDoublesMatchResult = async (req, res) => {
    const client = await pool.connect();

    try {
        const { matchId } = req.params;
        const { submittedBy, sets } = req.body;

        if (!submittedBy) {
            return res.status(400).json({
                success: false,
                message: "submittedBy is required"
            });
        }

        if (!Array.isArray(sets)) {
            return res.status(400).json({
                success: false,
                message: "sets must be an array"
            });
        }

        await client.query("BEGIN");

        const matchResult = await client.query(
            `SELECT
                id,
                team1_player1_id,
                team1_player2_id,
                team2_player1_id,
                team2_player2_id,
                status,
                number_of_sets
             FROM doubles_matches
             WHERE id = $1
             FOR UPDATE`,
            [matchId]
        );

        if (matchResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Doubles match not found"
            });
        }

        const match = matchResult.rows[0];
        const numberOfSets = Number(match.number_of_sets);
        const setsToWin = Math.ceil(numberOfSets / 2);

        if (match.status === "COMPLETED") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Match has already been completed"
            });
        }

        const matchPlayerIds = [
            Number(match.team1_player1_id),
            Number(match.team1_player2_id),
            Number(match.team2_player1_id),
            Number(match.team2_player2_id)
        ];

        if (!matchPlayerIds.includes(Number(submittedBy))) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                message: "You are not a player in this match"
            });
        }

        if (numberOfSets === 1) {
            if (sets.length !== 1) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "This is a single-set match. Provide exactly 1 set."
                });
            }
        } else {
            if (sets.length < setsToWin || sets.length > numberOfSets) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `A best-of-${numberOfSets} match must contain between ${setsToWin} and ${numberOfSets} sets`
                });
            }
        }

        let team1SetWins = 0;
        let team2SetWins = 0;

        for (let i = 0; i < sets.length; i++) {
            const team1Score = sets[i].team1Score;
            const team2Score = sets[i].team2Score;

            const validation = validateSetScore(
                team1Score,
                team2Score
            );

            if (!validation.valid) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `Set ${i + 1}: ${validation.message}`
                });
            }

            if (team1Score > team2Score) {
                team1SetWins++;
            } else {
                team2SetWins++;
            }
        }

        if (numberOfSets === 1) {
            if (team1SetWins !== 1 && team2SetWins !== 1) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "Invalid set result"
                });
            }
        } else {
            if (team1SetWins !== setsToWin && team2SetWins !== setsToWin) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `A team must win exactly ${setsToWin} sets in a best-of-${numberOfSets} match`
                });
            }

            const winnerSetWins = Math.max(team1SetWins, team2SetWins);
            const loserSetWins = Math.min(team1SetWins, team2SetWins);
            const expectedSets = winnerSetWins + loserSetWins;

            if (sets.length !== expectedSets) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `A ${winnerSetWins}-${loserSetWins} match must contain exactly ${expectedSets} sets`
                });
            }
        }

        const winningTeam = team1SetWins >= setsToWin ? 1 : 2;

        const playersResult = await client.query(
            `SELECT id, name, rating, wins, losses
             FROM players
             WHERE id IN ($1, $2, $3, $4)
             FOR UPDATE`,
            [
                match.team1_player1_id,
                match.team1_player2_id,
                match.team2_player1_id,
                match.team2_player2_id
            ]
        );

        const playerMap = {};
        playersResult.rows.forEach(p => {
            playerMap[Number(p.id)] = p;
        });

        const t1p1 = playerMap[Number(match.team1_player1_id)];
        const t1p2 = playerMap[Number(match.team1_player2_id)];
        const t2p1 = playerMap[Number(match.team2_player1_id)];
        const t2p2 = playerMap[Number(match.team2_player2_id)];

        const team1AvgRating = (Number(t1p1.rating) + Number(t1p2.rating)) / 2;
        const team2AvgRating = (Number(t2p1.rating) + Number(t2p2.rating)) / 2;

        const winners = winningTeam === 1
            ? [t1p1, t1p2]
            : [t2p1, t2p2];

        const losers = winningTeam === 1
            ? [t2p1, t2p2]
            : [t1p1, t1p2];

        const winnerTeamAvg = winningTeam === 1
            ? team1AvgRating
            : team2AvgRating;

        const loserTeamAvg = winningTeam === 1
            ? team2AvgRating
            : team1AvgRating;

        const winnerRatingChange = calculateRatingChange(
            winnerTeamAvg,
            loserTeamAvg,
            1
        );

        const loserRatingChange = calculateRatingChange(
            loserTeamAvg,
            winnerTeamAvg,
            0
        );

        for (let i = 0; i < sets.length; i++) {
            await client.query(
                `INSERT INTO doubles_match_sets
                    (
                        doubles_match_id,
                        set_number,
                        team1_score,
                        team2_score
                    )
                 VALUES ($1, $2, $3, $4)`,
                [
                    matchId,
                    i + 1,
                    sets[i].team1Score,
                    sets[i].team2Score
                ]
            );
        }

        const winnerPlayerChanges = [];
        for (const winner of winners) {
            const newRating = Number(winner.rating) + winnerRatingChange;

            await client.query(
                `UPDATE players
                 SET
                    rating = $1,
                    wins = wins + 1
                 WHERE id = $2`,
                [newRating, winner.id]
            );

            await client.query(
                `INSERT INTO rating_history
                    (
                        player_id,
                        match_id,
                        old_rating,
                        new_rating,
                        rating_change
                    )
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    winner.id,
                    null,
                    winner.rating,
                    newRating,
                    winnerRatingChange
                ]
            );

            winnerPlayerChanges.push({
                playerId: Number(winner.id),
                name: winner.name,
                oldRating: Number(winner.rating),
                newRating: newRating,
                change: winnerRatingChange
            });
        }

        const loserPlayerChanges = [];
        for (const loser of losers) {
            const newRating = Number(loser.rating) + loserRatingChange;

            await client.query(
                `UPDATE players
                 SET
                    rating = $1,
                    losses = losses + 1
                 WHERE id = $2`,
                [newRating, loser.id]
            );

            await client.query(
                `INSERT INTO rating_history
                    (
                        player_id,
                        match_id,
                        old_rating,
                        new_rating,
                        rating_change
                    )
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    loser.id,
                    null,
                    loser.rating,
                    newRating,
                    loserRatingChange
                ]
            );

            loserPlayerChanges.push({
                playerId: Number(loser.id),
                name: loser.name,
                oldRating: Number(loser.rating),
                newRating: newRating,
                change: loserRatingChange
            });
        }

        const completedMatch = await client.query(
            `UPDATE doubles_matches
             SET
                winning_team = $1,
                status = 'COMPLETED',
                completed_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [winningTeam, matchId]
        );

        await client.query("COMMIT");

        res.status(200).json({
            success: true,
            message: "Doubles match result submitted successfully",
            match: {
                id: Number(completedMatch.rows[0].id),
                status: completedMatch.rows[0].status,
                winningTeam,
                completedAt: completedMatch.rows[0].completed_at
            },
            result: {
                winningTeam,
                team1Sets: team1SetWins,
                team2Sets: team2SetWins
            },
            team1: {
                player1: {
                    id: Number(t1p1.id),
                    name: t1p1.name
                },
                player2: {
                    id: Number(t1p2.id),
                    name: t1p2.name
                }
            },
            team2: {
                player1: {
                    id: Number(t2p1.id),
                    name: t2p1.name
                },
                player2: {
                    id: Number(t2p2.id),
                    name: t2p2.name
                }
            },
            ratingChanges: {
                winningTeam: {
                    team: winningTeam === 1 ? "team1" : "team2",
                    pointsGained: winnerRatingChange,
                    players: winnerPlayerChanges
                },
                losingTeam: {
                    team: winningTeam === 1 ? "team2" : "team1",
                    pointsLost: loserRatingChange,
                    players: loserPlayerChanges
                }
            }
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Submit doubles match result error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to submit doubles match result"
        });

    } finally {
        client.release();
    }
};


// ================================================
// CANCEL DOUBLES MATCH (Admin)
// ================================================

const cancelDoublesMatch = async (req, res) => {
    try {
        const { matchId } = req.params;

        const updateResult = await pool.query(
            `UPDATE doubles_matches
             SET status = 'CANCELLED'
             WHERE id = $1
             AND status IN ('SCHEDULED', 'LIVE')
             RETURNING id`,
            [matchId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Doubles match not found or cannot be cancelled"
            });
        }

        const matchResult = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             WHERE dm.id = $1`,
            [matchId]
        );

        res.status(200).json({
            success: true,
            message: "Doubles match cancelled",
            match: formatDoublesMatch(matchResult.rows[0])
        });

    } catch (error) {
        console.error("Cancel doubles match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to cancel doubles match"
        });
    }
};


// ================================================
// REFEREE: START DOUBLES MATCH
// ================================================

const startDoublesMatch = async (req, res) => {
    try {
        const { matchId } = req.params;
        const refereeId = req.user.id;

        const updateResult = await pool.query(
            `UPDATE doubles_matches
             SET
                status = 'LIVE',
                started_at = CURRENT_TIMESTAMP
             WHERE id = $1
             AND referee_id = $2
             AND status = 'SCHEDULED'
             RETURNING id`,
            [matchId, refereeId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Doubles match cannot be started (must be scheduled and assigned to you)"
            });
        }

        const matchResult = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             WHERE dm.id = $1`,
            [matchId]
        );

        res.status(200).json({
            success: true,
            message: "Doubles match started",
            match: formatDoublesMatch(matchResult.rows[0])
        });

    } catch (error) {
        console.error("Start doubles match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to start doubles match"
        });
    }
};


// ================================================
// REFEREE: UPDATE LIVE SCORE FOR DOUBLES MATCH
// ================================================

const updateDoublesScore = async (req, res) => {
    const client = await pool.connect();

    try {
        const { matchId } = req.params;
        const refereeId = req.user.id;
        const { winner } = req.body;

        if (winner !== "TEAM1" && winner !== "TEAM2") {
            return res.status(400).json({
                success: false,
                message: "winner must be TEAM1 or TEAM2"
            });
        }

        await client.query("BEGIN");

        const matchResult = await client.query(
            `SELECT
                id,
                team1_player1_id,
                team1_player2_id,
                team2_player1_id,
                team2_player2_id,
                referee_id,
                current_set,
                current_team1_score,
                current_team2_score,
                status,
                number_of_sets
             FROM doubles_matches
             WHERE id = $1
             FOR UPDATE`,
            [matchId]
        );

        if (matchResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Doubles match not found"
            });
        }

        const match = matchResult.rows[0];
        const numberOfSets = Number(match.number_of_sets);
        const setsToWin = Math.ceil(numberOfSets / 2);

        if (Number(match.referee_id) !== Number(refereeId)) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                message: "You are not the referee assigned to this match"
            });
        }

        if (match.status === "COMPLETED") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message: "Match has already been completed"
            });
        }

        if (match.status !== "LIVE") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Match is not live"
            });
        }

        let team1Score = Number(match.current_team1_score);
        let team2Score = Number(match.current_team2_score);

        if (winner === "TEAM1") {
            team1Score++;
        } else {
            team2Score++;
        }

        if (team1Score > 30 || team2Score > 30) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Score cannot exceed 30"
            });
        }

        let setWinner = null;
        const maxScore = Math.max(team1Score, team2Score);
        const minScore = Math.min(team1Score, team2Score);

        if (maxScore === 21 && minScore < 20) {
            setWinner = team1Score > team2Score ? "TEAM1" : "TEAM2";
        } else if (maxScore >= 22 && maxScore < 30 && maxScore - minScore >= 2) {
            setWinner = team1Score > team2Score ? "TEAM1" : "TEAM2";
        } else if (maxScore === 30 && minScore === 29) {
            setWinner = team1Score > team2Score ? "TEAM1" : "TEAM2";
        }

        if (!setWinner) {
            await client.query(
                `UPDATE doubles_matches
                 SET
                    current_team1_score = $1,
                    current_team2_score = $2
                 WHERE id = $3`,
                [team1Score, team2Score, matchId]
            );

            await client.query("COMMIT");

            return res.status(200).json({
                success: true,
                message: "Score updated",
                setFinished: false,
                score: {
                    set: Number(match.current_set),
                    team1Score,
                    team2Score
                }
            });
        }

        const currentSet = Number(match.current_set);

        if (currentSet > numberOfSets) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Invalid set number"
            });
        }

        await client.query(
            `INSERT INTO doubles_match_sets
            (
                doubles_match_id,
                set_number,
                team1_score,
                team2_score
            )
            VALUES ($1, $2, $3, $4)`,
            [matchId, currentSet, team1Score, team2Score]
        );

        const setResults = await client.query(
            `SELECT
                COUNT(*) FILTER (WHERE team1_score > team2_score) AS team1_sets,
                COUNT(*) FILTER (WHERE team2_score > team1_score) AS team2_sets
             FROM doubles_match_sets
             WHERE doubles_match_id = $1`,
            [matchId]
        );

        const team1Sets = Number(setResults.rows[0].team1_sets);
        const team2Sets = Number(setResults.rows[0].team2_sets);

        if (team1Sets === setsToWin || team2Sets === setsToWin) {
            const winningTeam = team1Sets === setsToWin ? 1 : 2;

            const playersResult = await client.query(
                `SELECT id, rating, wins, losses
                 FROM players
                 WHERE id IN ($1, $2, $3, $4)
                 FOR UPDATE`,
                [
                    match.team1_player1_id,
                    match.team1_player2_id,
                    match.team2_player1_id,
                    match.team2_player2_id
                ]
            );

            const playerMap = {};
            playersResult.rows.forEach(p => {
                playerMap[Number(p.id)] = p;
            });

            const t1p1 = playerMap[Number(match.team1_player1_id)];
            const t1p2 = playerMap[Number(match.team1_player2_id)];
            const t2p1 = playerMap[Number(match.team2_player1_id)];
            const t2p2 = playerMap[Number(match.team2_player2_id)];

            const team1AvgRating = (Number(t1p1.rating) + Number(t1p2.rating)) / 2;
            const team2AvgRating = (Number(t2p1.rating) + Number(t2p2.rating)) / 2;

            const winners = winningTeam === 1 ? [t1p1, t1p2] : [t2p1, t2p2];
            const losers = winningTeam === 1 ? [t2p1, t2p2] : [t1p1, t1p2];

            const winnerTeamAvg = winningTeam === 1 ? team1AvgRating : team2AvgRating;
            const loserTeamAvg = winningTeam === 1 ? team2AvgRating : team1AvgRating;

            const winnerRatingChange = calculateRatingChange(winnerTeamAvg, loserTeamAvg, 1);
            const loserRatingChange = calculateRatingChange(loserTeamAvg, winnerTeamAvg, 0);

            for (const winner of winners) {
                const newRating = Number(winner.rating) + winnerRatingChange;

                await client.query(
                    `UPDATE players
                     SET
                        rating = $1,
                        wins = wins + 1
                     WHERE id = $2`,
                    [newRating, winner.id]
                );

                await client.query(
                    `INSERT INTO rating_history
                        (player_id, match_id, old_rating, new_rating, rating_change)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [winner.id, null, winner.rating, newRating, winnerRatingChange]
                );
            }

            for (const loser of losers) {
                const newRating = Number(loser.rating) + loserRatingChange;

                await client.query(
                    `UPDATE players
                     SET
                        rating = $1,
                        losses = losses + 1
                     WHERE id = $2`,
                    [newRating, loser.id]
                );

                await client.query(
                    `INSERT INTO rating_history
                        (player_id, match_id, old_rating, new_rating, rating_change)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [loser.id, null, loser.rating, newRating, loserRatingChange]
                );
            }

            const completedMatch = await client.query(
                `UPDATE doubles_matches
                 SET
                    winning_team = $1,
                    status = 'COMPLETED',
                    completed_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [winningTeam, matchId]
            );

            await client.query("COMMIT");

            return res.status(200).json({
                success: true,
                message: "Doubles match completed",
                match: completedMatch.rows[0],
                set: {
                    number: currentSet,
                    team1Score,
                    team2Score,
                    winner: setWinner
                },
                matchResult: {
                    winningTeam,
                    team1Sets,
                    team2Sets
                },
                ratingChanges: {
                    winnerTeamRatingChange: winnerRatingChange,
                    loserTeamRatingChange: loserRatingChange
                }
            });
        }

        await client.query(
            `UPDATE doubles_matches
             SET
                current_set = current_set + 1,
                current_team1_score = 0,
                current_team2_score = 0
             WHERE id = $1`,
            [matchId]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: "Set completed. Next set started.",
            set: {
                number: currentSet,
                team1Score,
                team2Score,
                winner: setWinner
            },
            matchScore: {
                team1Sets,
                team2Sets
            },
            nextSet: currentSet + 1,
            score: {
                team1Score: 0,
                team2Score: 0
            }
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Update live score error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update score"
        });

    } finally {
        client.release();
    }
};


// ================================================
// REFEREE: GET MY ASSIGNED DOUBLES MATCHES
// ================================================

const getMyDoublesMatches = async (req, res) => {
    try {
        const refereeId = req.user.id;

        const result = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             WHERE dm.referee_id = $1

             ORDER BY
                CASE
                    WHEN dm.status = 'LIVE' THEN 1
                    WHEN dm.status = 'SCHEDULED' THEN 2
                    ELSE 3
                END,
                dm.scheduled_at ASC`,
            [refereeId]
        );

        const matches = result.rows.map(row => formatDoublesMatch(row));

        res.status(200).json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {
        console.error("Get referee doubles matches error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get referee doubles matches"
        });
    }
};


// ================================================
// GET LIVE DOUBLES MATCHES
// ================================================

const getLiveDoublesMatches = async (req, res) => {
    try {
        const result = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             WHERE dm.status = 'LIVE'

             ORDER BY dm.started_at DESC, dm.scheduled_at ASC`
        );

        const matchIds = result.rows.map(r => r.id);
        const setsByMatch = {};

        if (matchIds.length > 0) {
            const setsResult = await pool.query(
                `SELECT
                    doubles_match_id,
                    set_number,
                    team1_score,
                    team2_score
                 FROM doubles_match_sets
                 WHERE doubles_match_id = ANY($1::int[])
                 ORDER BY doubles_match_id ASC, set_number ASC`,
                [matchIds]
            );

            setsResult.rows.forEach(s => {
                if (!setsByMatch[s.doubles_match_id]) {
                    setsByMatch[s.doubles_match_id] = [];
                }
                setsByMatch[s.doubles_match_id].push({
                    setNumber: Number(s.set_number),
                    team1Score: Number(s.team1_score),
                    team2Score: Number(s.team2_score)
                });
            });
        }

        const matches = result.rows.map(row =>
            formatDoublesMatch(row, setsByMatch[row.id] || [])
        );

        res.status(200).json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {
        console.error("Get live doubles matches error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get live doubles matches"
        });
    }
};


// ================================================
// GET UPCOMING DOUBLES MATCHES
// ================================================

const getUpcomingDoublesMatches = async (req, res) => {
    try {
        const result = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             WHERE dm.status = 'SCHEDULED'
             AND dm.scheduled_at > CURRENT_TIMESTAMP

             ORDER BY dm.scheduled_at ASC`
        );

        const matches = result.rows.map(row => formatDoublesMatch(row));

        res.status(200).json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {
        console.error("Get upcoming doubles matches error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get upcoming doubles matches"
        });
    }
};


// ================================================
// GET COMPLETED DOUBLES MATCHES
// ================================================

const getCompletedDoublesMatches = async (req, res) => {
    try {
        const result = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            rating DESC,
                            wins DESC,
                            losses ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM players
                WHERE approval_status = 'APPROVED'
            )
            SELECT
                dm.id,
                dm.status,
                dm.court,
                dm.number_of_sets,
                dm.winning_team,
                dm.current_set,
                dm.current_team1_score,
                dm.current_team2_score,
                dm.scheduled_at,
                dm.started_at,
                dm.completed_at,
                dm.created_at,

                t1p1.id AS team1_player1_id,
                t1p1.name AS team1_player1_name,
                t1p1.rating AS team1_player1_rating,
                t1p1.rank AS team1_player1_rank,

                t1p2.id AS team1_player2_id,
                t1p2.name AS team1_player2_name,
                t1p2.rating AS team1_player2_rating,
                t1p2.rank AS team1_player2_rank,

                t2p1.id AS team2_player1_id,
                t2p1.name AS team2_player1_name,
                t2p1.rating AS team2_player1_rating,
                t2p1.rank AS team2_player1_rank,

                t2p2.id AS team2_player2_id,
                t2p2.name AS team2_player2_name,
                t2p2.rating AS team2_player2_rating,
                t2p2.rank AS team2_player2_rank,

                r.id AS referee_id,
                r.name AS referee_name

             FROM doubles_matches dm

             JOIN ranked_players t1p1 ON dm.team1_player1_id = t1p1.id
             JOIN ranked_players t1p2 ON dm.team1_player2_id = t1p2.id
             JOIN ranked_players t2p1 ON dm.team2_player1_id = t2p1.id
             JOIN ranked_players t2p2 ON dm.team2_player2_id = t2p2.id

             LEFT JOIN referees r ON dm.referee_id = r.id

             WHERE dm.status = 'COMPLETED'

             ORDER BY dm.completed_at DESC`
        );

        const matchIds = result.rows.map(r => r.id);
        const setsByMatch = {};

        if (matchIds.length > 0) {
            const setsResult = await pool.query(
                `SELECT
                    doubles_match_id,
                    set_number,
                    team1_score,
                    team2_score
                 FROM doubles_match_sets
                 WHERE doubles_match_id = ANY($1::int[])
                 ORDER BY doubles_match_id ASC, set_number ASC`,
                [matchIds]
            );

            setsResult.rows.forEach(s => {
                if (!setsByMatch[s.doubles_match_id]) {
                    setsByMatch[s.doubles_match_id] = [];
                }
                setsByMatch[s.doubles_match_id].push({
                    setNumber: Number(s.set_number),
                    team1Score: Number(s.team1_score),
                    team2Score: Number(s.team2_score)
                });
            });
        }

        const matches = result.rows.map(row =>
            formatDoublesMatch(row, setsByMatch[row.id] || [])
        );

        res.status(200).json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {
        console.error("Get completed doubles matches error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get completed doubles matches"
        });
    }
};


module.exports = {
    createDoublesMatch,
    getDoublesMatchById,
    getAllDoublesMatches,
    getPlayerDoublesMatches,
    submitDoublesMatchResult,
    cancelDoublesMatch,
    startDoublesMatch,
    updateDoublesScore,
    getMyDoublesMatches,
    getLiveDoublesMatches,
    getUpcomingDoublesMatches,
    getCompletedDoublesMatches
};

