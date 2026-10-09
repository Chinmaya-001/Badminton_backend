const pool = require("../config/database");

const {
    calculateRatingChange
} = require("../utils/elo");

const {
    validateSetScore
} = require("../utils/badminton");


const createMatch = async (req, res) => {
    try {
        const {
            player1Id,
            player2Id,
            refereeId,
            court,
            scheduledAt,
            numberOfSets
        } = req.body;

        if (!player1Id || !player2Id || !scheduledAt) {
            return res.status(400).json({
                success: false,
                message: "player1Id, player2Id and scheduledAt are required"
            });
        }

        // Validate numberOfSets (defaults to 3)
        const setsToPlay = numberOfSets ? Number(numberOfSets) : 3;

        if (![1, 3, 5].includes(setsToPlay)) {
            return res.status(400).json({
                success: false,
                message: "numberOfSets must be 1, 3, or 5"
            });
        }

        if (Number(player1Id) === Number(player2Id)) {
            return res.status(400).json({
                success: false,
                message: "A player cannot play against themselves"
            });
        }

        // Check players
        const playersResult = await pool.query(
            `SELECT id, name, rating
             FROM players
             WHERE id IN ($1, $2)`,
            [player1Id, player2Id]
        );

        if (playersResult.rows.length !== 2) {
            return res.status(404).json({
                success: false,
                message: "One or both players not found"
            });
        }

        // Check referee if provided
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
        }

        const result = await pool.query(
            `INSERT INTO matches
            (
                player1_id,
                player2_id,
                referee_id,
                court,
                scheduled_at,
                status,
                number_of_sets
            )
            VALUES ($1, $2, $3, $4, $5, 'SCHEDULED', $6)
            RETURNING
                id,
                player1_id,
                player2_id,
                referee_id,
                court,
                scheduled_at,
                status,
                number_of_sets,
                created_at`,
            [
                player1Id,
                player2Id,
                refereeId || null,
                court || null,
                scheduledAt,
                setsToPlay
            ]
        );

        res.status(201).json({
            success: true,
            message: "Match scheduled successfully",
            match: result.rows[0]
        });

    } catch (error) {
        console.error("Create match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create match"
        });
    }
};


const getMatchById = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT
                m.id,
                m.status,
                m.winner_id,
                m.created_at,
                m.completed_at,

                p1.id AS player1_id,
                p1.name AS player1_name,
                p1.rating AS player1_rating,

                p2.id AS player2_id,
                p2.name AS player2_name,
                p2.rating AS player2_rating

             FROM matches m

             JOIN players p1
                ON m.player1_id = p1.id

             JOIN players p2
                ON m.player2_id = p2.id

             WHERE m.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Match not found"
            });
        }

        res.status(200).json({
            success: true,
            match: result.rows[0]
        });

    } catch (error) {
        console.error("Get match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get match"
        });
    }
};

const getPlayerMatches = async (req, res) => {
    try {
        const { playerId } = req.params;

        const result = await pool.query(
            `SELECT
                m.id,
                m.status,
                m.winner_id,
                m.created_at,
                m.completed_at,

                p1.id AS player1_id,
                p1.name AS player1_name,
                p1.rating AS player1_rating,

                p2.id AS player2_id,
                p2.name AS player2_name,
                p2.rating AS player2_rating

             FROM matches m

             JOIN players p1
                ON m.player1_id = p1.id

             JOIN players p2
                ON m.player2_id = p2.id

             WHERE m.player1_id = $1
                OR m.player2_id = $1

             ORDER BY m.created_at DESC`,
            [playerId]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            matches: result.rows
        });

    } catch (error) {
        console.error("Get player matches error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get player matches"
        });
    }
};

const submitMatchResult = async (req, res) => {
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

        // Get match and lock it
        const matchResult = await client.query(
            `SELECT
                id,
                player1_id,
                player2_id,
                status,
                number_of_sets
             FROM matches
             WHERE id = $1
             FOR UPDATE`,
            [matchId]
        );

        if (matchResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Match not found"
            });
        }

        const match = matchResult.rows[0];
        const numberOfSets = Number(match.number_of_sets);
        const setsToWin = Math.ceil(numberOfSets / 2);

        // Validate sets count based on match format
        if (numberOfSets === 1) {
            if (sets.length !== 1) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "This is a single-set match. Provide exactly 1 set."
                });
            }
        } else {
            // For best-of-3 or best-of-5
            if (sets.length < setsToWin || sets.length > numberOfSets) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `A best-of-${numberOfSets} match must contain between ${setsToWin} and ${numberOfSets} sets`
                });
            }
        }

        // Match must not be completed
        if (match.status === "COMPLETED") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Match has already been completed"
            });
        }

        // Check submitter is one of the players
        if (
            Number(submittedBy) !== Number(match.player1_id) &&
            Number(submittedBy) !== Number(match.player2_id)
        ) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                message: "You are not a player in this match"
            });
        }

        // Validate sets
        let player1SetWins = 0;
        let player2SetWins = 0;

        for (let i = 0; i < sets.length; i++) {
            const player1Score = sets[i].player1Score;
            const player2Score = sets[i].player2Score;

            const validation = validateSetScore(
                player1Score,
                player2Score
            );

            if (!validation.valid) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `Set ${i + 1}: ${validation.message}`
                });
            }

            if (player1Score > player2Score) {
                player1SetWins++;
            } else {
                player2SetWins++;
            }
        }

        // Determine winner based on match format
        if (numberOfSets === 1) {
            // Single set: winner is whoever won the set
            if (player1SetWins !== 1 && player2SetWins !== 1) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "Invalid set result"
                });
            }
        } else {
            // Best-of-N: one player must reach setsToWin
            if (player1SetWins !== setsToWin && player2SetWins !== setsToWin) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `A player must win exactly ${setsToWin} sets in a best-of-${numberOfSets} match`
                });
            }

            // Validate that no extra sets were played after someone won
            const winnerSetWins = Math.max(player1SetWins, player2SetWins);
            const loserSetWins = Math.min(player1SetWins, player2SetWins);
            const expectedSets = winnerSetWins + loserSetWins;

            if (sets.length !== expectedSets) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `A ${winnerSetWins}-${loserSetWins} match must contain exactly ${expectedSets} sets`
                });
            }
        }

        const winnerId =
            player1SetWins >= setsToWin
                ? match.player1_id
                : match.player2_id;

        const loserId =
            player1SetWins >= setsToWin
                ? match.player2_id
                : match.player1_id;

        // Get player ratings
        const playersResult = await client.query(
            `SELECT id, rating, wins, losses
             FROM players
             WHERE id IN ($1, $2)
             FOR UPDATE`,
            [match.player1_id, match.player2_id]
        );

        const player1 = playersResult.rows.find(
            player => Number(player.id) === Number(match.player1_id)
        );

        const player2 = playersResult.rows.find(
            player => Number(player.id) === Number(match.player2_id)
        );

        const winner =
            Number(winnerId) === Number(player1.id)
                ? player1
                : player2;

        const loser =
            Number(loserId) === Number(player1.id)
                ? player1
                : player2;

        // Calculate Elo
        const winnerRatingChange = calculateRatingChange(
            Number(winner.rating),
            Number(loser.rating),
            1
        );

        const loserRatingChange = calculateRatingChange(
            Number(loser.rating),
            Number(winner.rating),
            0
        );

        const newWinnerRating =
            Number(winner.rating) + winnerRatingChange;

        const newLoserRating =
            Number(loser.rating) + loserRatingChange;

        // Save sets
        for (let i = 0; i < sets.length; i++) {
            await client.query(
                `INSERT INTO match_sets
                    (
                        match_id,
                        set_number,
                        player1_score,
                        player2_score
                    )
                 VALUES ($1, $2, $3, $4)`,
                [
                    matchId,
                    i + 1,
                    sets[i].player1Score,
                    sets[i].player2Score
                ]
            );
        }

        // Update winner
        await client.query(
            `UPDATE players
             SET
                rating = $1,
                wins = wins + 1
             WHERE id = $2`,
            [
                newWinnerRating,
                winner.id
            ]
        );

        // Update loser
        await client.query(
            `UPDATE players
             SET
                rating = $1,
                losses = losses + 1
             WHERE id = $2`,
            [
                newLoserRating,
                loser.id
            ]
        );

        // Save winner rating history
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
                matchId,
                winner.rating,
                newWinnerRating,
                winnerRatingChange
            ]
        );

        // Save loser rating history
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
                matchId,
                loser.rating,
                newLoserRating,
                loserRatingChange
            ]
        );

        // Complete match
        const completedMatch = await client.query(
            `UPDATE matches
             SET
                winner_id = $1,
                status = 'COMPLETED',
                completed_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING
                id,
                player1_id,
                player2_id,
                winner_id,
                status,
                created_at,
                completed_at`,
            [winnerId, matchId]
        );

        await client.query("COMMIT");

        res.status(200).json({
            success: true,
            message: "Match result submitted successfully",
            match: completedMatch.rows[0],
            result: {
                winnerId,
                player1Sets: player1SetWins,
                player2Sets: player2SetWins
            },
            ratingChanges: {
                winner: {
                    playerId: winner.id,
                    oldRating: Number(winner.rating),
                    newRating: newWinnerRating,
                    change: winnerRatingChange
                },
                loser: {
                    playerId: loser.id,
                    oldRating: Number(loser.rating),
                    newRating: newLoserRating,
                    change: loserRatingChange
                }
            }
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Submit match result error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to submit match result"
        });

    } finally {
        client.release();
    }
};

module.exports = {
    createMatch,
    getMatchById,
    getPlayerMatches,
    submitMatchResult
};