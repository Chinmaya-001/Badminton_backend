const pool = require("../config/database");

const {
    cancelExpiredMatches
} = require("../utils/matchStatus");

const {
    calculateRatingChange
} = require("../utils/elo");

const startMatch = async (req, res) => {
    try {
        const { matchId } = req.params;
        const refereeId = req.user.id;

        const result = await pool.query(
            `UPDATE matches
            SET
                status = 'LIVE',
                started_at = CURRENT_TIMESTAMP
            WHERE id = $1
            AND referee_id = $2
            AND status = 'SCHEDULED'
            AND scheduled_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            RETURNING
                id,
                player1_id,
                player2_id,
                referee_id,
                court,
                scheduled_at,
                status,
                started_at`,
            [matchId, refereeId]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Match cannot be started"
            });
        }

        res.status(200).json({
            success: true,
            message: "Match started",
            match: result.rows[0]
        });

    } catch (error) {
        console.error("Start match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to start match"
        });
    }
};

const updateScore = async (req, res) => {
    const client = await pool.connect();

    try {
        const { matchId } = req.params;
        const refereeId = req.user.id;
        const { winner } = req.body;


        if (winner !== "PLAYER1" && winner !== "PLAYER2") {
            return res.status(400).json({
                success: false,
                message: "winner must be PLAYER1 or PLAYER2"
            });
        }

        await client.query("BEGIN");

        const matchResult = await client.query(
            `SELECT
                id,
                player1_id,
                player2_id,
                referee_id,
                current_set,
                current_player1_score,
                current_player2_score,
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

        // Check referee
        if (Number(match.referee_id) !== Number(refereeId)) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                message: "You are not the referee assigned to this match"
            });
        }

        // Check match status
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

        let player1Score = Number(
            match.current_player1_score
        );

        let player2Score = Number(
            match.current_player2_score
        );

        // Add exactly ONE point
        if (winner === "PLAYER1") {
            player1Score++;
        } else {
            player2Score++;
        }

        // Never allow a score above 30
        if (player1Score > 30 || player2Score > 30) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Score cannot exceed 30"
            });
        }

        // ---------------------------------------
        // CHECK IF SET IS FINISHED
        // ---------------------------------------

        let setWinner = null;

        const maxScore = Math.max(
            player1Score,
            player2Score
        );

        const minScore = Math.min(
            player1Score,
            player2Score
        );

        // 21-0 through 21-19
        if (
            maxScore === 21 &&
            minScore < 20
        ) {
            setWinner =
                player1Score > player2Score
                    ? "PLAYER1"
                    : "PLAYER2";
        }

        // 22-20 through 29-27
        else if (
            maxScore >= 22 &&
            maxScore < 30 &&
            maxScore - minScore >= 2
        ) {
            setWinner =
                player1Score > player2Score
                    ? "PLAYER1"
                    : "PLAYER2";
        }

        // 30-29
        else if (
            maxScore === 30 &&
            minScore === 29
        ) {
            setWinner =
                player1Score > player2Score
                    ? "PLAYER1"
                    : "PLAYER2";
        }

        // ---------------------------------------
        // SET NOT FINISHED
        // ---------------------------------------

        if (!setWinner) {

            await client.query(
                `UPDATE matches
                 SET
                    current_player1_score = $1,
                    current_player2_score = $2
                 WHERE id = $3`,
                [
                    player1Score,
                    player2Score,
                    matchId
                ]
            );

            await client.query("COMMIT");

            return res.status(200).json({
                success: true,
                message: "Score updated",
                setFinished: false,
                score: {
                    set: Number(match.current_set),
                    player1Score,
                    player2Score
                }
            });
        }

        // ---------------------------------------
        // SET FINISHED
        // ---------------------------------------

        const currentSet = Number(
            match.current_set
        );

        if (currentSet > numberOfSets) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Invalid set number"
            });
        }

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
                currentSet,
                player1Score,
                player2Score
            ]
        );

        // Count sets
        const setResults = await client.query(
            `SELECT
                COUNT(*) FILTER (
                    WHERE player1_score > player2_score
                ) AS player1_sets,

                COUNT(*) FILTER (
                    WHERE player2_score > player1_score
                ) AS player2_sets

             FROM match_sets
             WHERE match_id = $1`,
            [matchId]
        );

        const player1Sets = Number(
            setResults.rows[0].player1_sets
        );

        const player2Sets = Number(
            setResults.rows[0].player2_sets
        );

        // ---------------------------------------
        // MATCH FINISHED
        // ---------------------------------------

        if (
            player1Sets === setsToWin ||
            player2Sets === setsToWin
        ) {

            const winnerId =
                player1Sets === setsToWin
                    ? match.player1_id
                    : match.player2_id;

            const loserId =
                player1Sets === setsToWin
                    ? match.player2_id
                    : match.player1_id;

            const playersResult = await client.query(
                `SELECT
                    id,
                    rating,
                    wins,
                    losses
                 FROM players
                 WHERE id IN ($1, $2)
                 FOR UPDATE`,
                [
                    match.player1_id,
                    match.player2_id
                ]
            );

            const player1 = playersResult.rows.find(
                player =>
                    Number(player.id) ===
                    Number(match.player1_id)
            );

            const player2 = playersResult.rows.find(
                player =>
                    Number(player.id) ===
                    Number(match.player2_id)
            );

            const winner =
                Number(winnerId) ===
                    Number(player1.id)
                    ? player1
                    : player2;

            const loser =
                Number(loserId) ===
                    Number(player1.id)
                    ? player1
                    : player2;

            // Elo
            const winnerRatingChange =
                calculateRatingChange(
                    Number(winner.rating),
                    Number(loser.rating),
                    1
                );

            const loserRatingChange =
                calculateRatingChange(
                    Number(loser.rating),
                    Number(winner.rating),
                    0
                );

            const newWinnerRating =
                Number(winner.rating) +
                winnerRatingChange;

            const newLoserRating =
                Number(loser.rating) +
                loserRatingChange;

            // Winner
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

            // Loser
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

            // Winner history
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

            // Loser history
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
            const completedMatch =
                await client.query(
                    `UPDATE matches
                     SET
                        winner_id = $1,
                        status = 'COMPLETED',
                        completed_at = CURRENT_TIMESTAMP
                     WHERE id = $2
                     RETURNING *`,
                    [
                        winnerId,
                        matchId
                    ]
                );

            await client.query("COMMIT");

            return res.status(200).json({
                success: true,
                message: "Match completed",

                match: completedMatch.rows[0],

                set: {
                    number: currentSet,
                    player1Score,
                    player2Score,
                    winner: setWinner
                },

                matchResult: {
                    winnerId,
                    player1Sets,
                    player2Sets
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
        }

        // ---------------------------------------
        // NEXT SET
        // ---------------------------------------

        await client.query(
            `UPDATE matches
             SET
                current_set = current_set + 1,
                current_player1_score = 0,
                current_player2_score = 0
             WHERE id = $1`,
            [matchId]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: "Set completed. Next set started.",

            set: {
                number: currentSet,
                player1Score,
                player2Score,
                winner: setWinner
            },

            matchScore: {
                player1Sets,
                player2Sets
            },

            nextSet: currentSet + 1,

            score: {
                player1Score: 0,
                player2Score: 0
            }
        });

    } catch (error) {

        await client.query("ROLLBACK");

        console.error(
            "Update live score error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to update score"
        });

    } finally {
        client.release();
    }
};

const getMyMatches = async (req, res) => {
    try {

        await cancelExpiredMatches();

        const refereeId = req.user.id;

        const result = await pool.query(
            `SELECT
                m.id,
                m.status,
                m.court,
                m.scheduled_at,
                m.started_at,
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

             WHERE m.referee_id = $1

             ORDER BY
                CASE
                    WHEN m.status = 'LIVE' THEN 1
                    WHEN m.status = 'SCHEDULED' THEN 2
                    ELSE 3
                END,
                m.scheduled_at ASC`,
            [refereeId]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            matches: result.rows
        });

    } catch (error) {

        console.error(
            "Get referee matches error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to get referee matches"
        });
    }
};

module.exports = {
    startMatch,
    updateScore,
    getMyMatches
};