const pool = require("../config/database");

const {
    cancelExpiredMatches
} = require("../utils/matchStatus");

const {
    getPhotoSignedUrl
} = require("../config/supabase");

const getMyDashboard = async (req, res) => {
    try {
        const playerId = req.user.id;

        // Mark old scheduled matches as cancelled
        await cancelExpiredMatches();

        // Get player information
        const playerResult = await pool.query(
            `SELECT
                id,
                name,
                email,
                phone,
                rating,
                wins,
                losses,
                gender,
                photo_url,
                approval_status
             FROM players
             WHERE id = $1`,
            [playerId]
        );

        if (playerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Player not found"
            });
        }

        const player = playerResult.rows[0];

        // Calculate rank using consistent ROW_NUMBER ordering
        const rankResult = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
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
            SELECT rank FROM ranked_players WHERE id = $1`,
            [playerId]
        );

        const rank = rankResult.rows.length > 0 ? Number(rankResult.rows[0].rank) : null;

        // Upcoming match
        const upcomingResult = await pool.query(
            `SELECT
                m.id,
                m.status,
                m.court,
                m.scheduled_at,

                p1.id AS player1_id,
                p1.name AS player1_name,

                p2.id AS player2_id,
                p2.name AS player2_name,

                r.id AS referee_id,
                r.name AS referee_name

             FROM matches m

             JOIN players p1
                ON m.player1_id = p1.id

             JOIN players p2
                ON m.player2_id = p2.id

             LEFT JOIN referees r
                ON m.referee_id = r.id

             WHERE
                (
                    m.player1_id = $1
                    OR m.player2_id = $1
                )

                AND m.status = 'SCHEDULED'

                AND m.scheduled_at > CURRENT_TIMESTAMP

             ORDER BY m.scheduled_at ASC

             LIMIT 1`,
            [playerId]
        );

        let upcomingMatch = null;

        if (upcomingResult.rows.length > 0) {
            const match = upcomingResult.rows[0];

            const isPlayer1 =
                Number(match.player1_id) === Number(playerId);

            upcomingMatch = {
                id: match.id,
                status: match.status,
                court: match.court,
                scheduledAt: match.scheduled_at,

                opponent: {
                    id: isPlayer1
                        ? match.player2_id
                        : match.player1_id,

                    name: isPlayer1
                        ? match.player2_name
                        : match.player1_name
                },

                referee: match.referee_id
                    ? {
                        id: match.referee_id,
                        name: match.referee_name
                    }
                    : null
            };
        }

        // Recent completed matches
        const recentResult = await pool.query(
            `SELECT
                m.id,
                m.status,
                m.scheduled_at,
                m.completed_at,
                m.winner_id,

                p1.id AS player1_id,
                p1.name AS player1_name,

                p2.id AS player2_id,
                p2.name AS player2_name

             FROM matches m

             JOIN players p1
                ON m.player1_id = p1.id

             JOIN players p2
                ON m.player2_id = p2.id

             WHERE
                (
                    m.player1_id = $1
                    OR m.player2_id = $1
                )

                AND m.status IN (
                    'COMPLETED',
                    'CANCELLED'
                )

             ORDER BY
                COALESCE(
                    m.completed_at,
                    m.scheduled_at
                ) DESC

             LIMIT 5`,
            [playerId]
        );

        const recentMatches = recentResult.rows.map(match => {

            const isPlayer1 =
                Number(match.player1_id) ===
                Number(playerId);

            let result = null;

            if (match.status === "COMPLETED") {
                result =
                    Number(match.winner_id) ===
                    Number(playerId)
                        ? "WIN"
                        : "LOSS";
            }

            return {
                id: match.id,
                status: match.status,

                opponent: {
                    id: isPlayer1
                        ? match.player2_id
                        : match.player1_id,

                    name: isPlayer1
                        ? match.player2_name
                        : match.player1_name
                },

                result,

                date:
                    match.completed_at ||
                    match.scheduled_at
            };
        });

        // Latest rating change
        const ratingResult = await pool.query(
            `SELECT
                match_id,
                old_rating,
                new_rating,
                rating_change,
                created_at
             FROM rating_history
             WHERE player_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [playerId]
        );

        let latestRatingChange = null;

        if (ratingResult.rows.length > 0) {
            const rating = ratingResult.rows[0];

            latestRatingChange = {
                matchId: rating.match_id,
                oldRating: Number(rating.old_rating),
                newRating: Number(rating.new_rating),
                change: Number(rating.rating_change),
                date: rating.created_at
            };
        }

        const matchesPlayed =
            Number(player.wins) +
            Number(player.losses);

        const winPercentage =
            matchesPlayed === 0
                ? 0
                : Number(
                    (
                        Number(player.wins) /
                        matchesPlayed *
                        100
                    ).toFixed(2)
                );

        const photoUrl = await getPhotoSignedUrl(player.photo_url);

        res.status(200).json({
            success: true,

            player: {
                id: player.id,
                name: player.name,
                email: player.email,
                phone: player.phone,
                gender: player.gender || null,
                photoUrl,

                rank,
                rating: Number(player.rating),

                wins: Number(player.wins),
                losses: Number(player.losses),

                matchesPlayed,
                winPercentage,

                approvalStatus:
                    player.approval_status
            },

            upcomingMatch,

            recentMatches,

            latestRatingChange
        });

    } catch (error) {

        console.error(
            "Get player dashboard error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to get dashboard"
        });
    }
};


const getPlayerById = async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid player ID"
            });
        }

        const result = await pool.query(
            `SELECT 
                id,
                name,
                phone,
                email,
                gender,
                photo_url,
                rating,
                wins,
                losses,
                approval_status,
                created_at
             FROM players
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Player not found"
            });
        }

        const playerRow = result.rows[0];
        const photoUrl = await getPhotoSignedUrl(playerRow.photo_url);

        const rankResult = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
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
            SELECT rank FROM ranked_players WHERE id = $1`,
            [id]
        );

        const rank = rankResult.rows.length > 0 ? Number(rankResult.rows[0].rank) : null;

        res.status(200).json({
            success: true,
            player: {
                id: playerRow.id,
                name: playerRow.name,
                email: playerRow.email,
                phone: playerRow.phone,
                gender: playerRow.gender || null,
                photoUrl,
                rank,
                rating: Number(playerRow.rating),
                wins: Number(playerRow.wins),
                losses: Number(playerRow.losses),
                approvalStatus: playerRow.approval_status,
                createdAt: playerRow.created_at
            }
        });

    } catch (error) {
        console.error("Get player error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get player"
        });
    }
};

const getMyProfile = async (req, res) => {
    try {
        const playerId = req.user.id;

        const result = await pool.query(
            `SELECT
                id,
                name,
                email,
                phone,
                gender,
                photo_url,
                rating,
                wins,
                losses,
                approval_status,
                created_at
             FROM players
             WHERE id = $1`,
            [playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Player not found"
            });
        }

        const player = result.rows[0];

        const matchesPlayed =
            Number(player.wins) +
            Number(player.losses);

        const winPercentage =
            matchesPlayed === 0
                ? 0
                : Number(
                    (
                        Number(player.wins) /
                        matchesPlayed *
                        100
                    ).toFixed(2)
                );

        const photoUrl = await getPhotoSignedUrl(player.photo_url);

        res.status(200).json({
            success: true,
            player: {
                id: player.id,
                name: player.name,
                email: player.email,
                phone: player.phone,
                gender: player.gender || null,
                photoUrl,
                rating: Number(player.rating),
                wins: Number(player.wins),
                losses: Number(player.losses),
                matchesPlayed,
                winPercentage,
                approvalStatus: player.approval_status
            }
        });

    } catch (error) {

        console.error(
            "Get my profile error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to get profile"
        });
    }
};

const getMyMatches = async (req, res) => {
    try {
        const playerId = req.user.id;

        await cancelExpiredMatches();

        const result = await pool.query(
            `SELECT
        m.id,
        m.status,
        m.court,
        m.scheduled_at,
        m.started_at,
        m.completed_at,
        m.winner_id,
        m.cancellation_reason,

        p1.id AS player1_id,
        p1.name AS player1_name,

        p2.id AS player2_id,
        p2.name AS player2_name,

        r.id AS referee_id,
        r.name AS referee_name

     FROM matches m

     JOIN players p1
        ON m.player1_id = p1.id

     JOIN players p2
        ON m.player2_id = p2.id

     LEFT JOIN referees r
        ON m.referee_id = r.id

     WHERE
        (
            m.player1_id = $1
            OR m.player2_id = $1
        )

        AND m.status IN (
            'COMPLETED',
            'CANCELLED'
        )

     ORDER BY
        m.scheduled_at DESC`,
            [playerId]
        );
        const matches = result.rows.map(match => ({
            id: match.id,
            status: match.status,
            court: match.court,
            scheduledAt: match.scheduled_at,
            startedAt: match.started_at,
            completedAt: match.completed_at,
            winnerId: match.winner_id,

            cancellationReason:
                match.cancellation_reason,

            player1: {
                id: match.player1_id,
                name: match.player1_name
            },

            player2: {
                id: match.player2_id,
                name: match.player2_name
            },

            referee: match.referee_id
                ? {
                    id: match.referee_id,
                    name: match.referee_name
                }
                : null,

            result:
                match.status === "COMPLETED"
                    ? (
                        Number(match.winner_id) ===
                            Number(playerId)
                            ? "WIN"
                            : "LOSS"
                    )
                    : null
        }));

        res.status(200).json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {

        console.error(
            "Get player matches error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to get player matches"
        });
    }
};

const getMyUpcomingMatches = async (req, res) => {
    try {


        const playerId = req.user.id;

        await cancelExpiredMatches();

        // await pool.query(
        //     `UPDATE matches
        //     SET status = 'CANCELLED'
        //     WHERE status = 'SCHEDULED'
        //     AND scheduled_at < CURRENT_TIMESTAMP`
        // );

        const result = await pool.query(
            `SELECT
        m.id,
        m.status,
        m.court,
        m.scheduled_at,

        p1.id AS player1_id,
        p1.name AS player1_name,

        p2.id AS player2_id,
        p2.name AS player2_name,

        r.id AS referee_id,
        r.name AS referee_name

     FROM matches m

     JOIN players p1
        ON m.player1_id = p1.id

     JOIN players p2
        ON m.player2_id = p2.id

     LEFT JOIN referees r
        ON m.referee_id = r.id

     WHERE
        (
            m.player1_id = $1
            OR m.player2_id = $1
        )

        AND m.status = 'SCHEDULED'

        AND m.scheduled_at > CURRENT_TIMESTAMP

     ORDER BY
        m.scheduled_at ASC`,
            [playerId]
        );

        const matches = result.rows.map(match => ({
            id: match.id,
            status: match.status,
            court: match.court,
            scheduledAt: match.scheduled_at,

            opponent:
                Number(match.player1_id) ===
                    Number(playerId)
                    ? {
                        id: match.player2_id,
                        name: match.player2_name
                    }
                    : {
                        id: match.player1_id,
                        name: match.player1_name
                    },

            referee: match.referee_id
                ? {
                    id: match.referee_id,
                    name: match.referee_name
                }
                : null
        }));

        res.status(200).json({
            success: true,
            count: matches.length,
            matches
        });

    } catch (error) {

        console.error(
            "Get upcoming matches error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to get upcoming matches"
        });
    }
};


const getMyMatchDetails = async (req, res) => {
    try {
        const playerId = req.user.id;
        const { matchId } = req.params;

        const matchResult = await pool.query(
            `SELECT
                m.id,
                m.status,
                m.court,
                m.scheduled_at,
                m.started_at,
                m.completed_at,
                m.winner_id,
                m.cancellation_reason,

                p1.id AS player1_id,
                p1.name AS player1_name,
                p1.rating AS player1_rating,

                p2.id AS player2_id,
                p2.name AS player2_name,
                p2.rating AS player2_rating,

                r.id AS referee_id,
                r.name AS referee_name

             FROM matches m

             JOIN players p1
                ON m.player1_id = p1.id

             JOIN players p2
                ON m.player2_id = p2.id

             LEFT JOIN referees r
                ON m.referee_id = r.id

             WHERE
                m.id = $1

                AND (
                    m.player1_id = $2
                    OR m.player2_id = $2
                )`,
            [matchId, playerId]
        );

        if (matchResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Match not found"
            });
        }

        const match = matchResult.rows[0];

        // Get completed sets
        const setsResult = await pool.query(
            `SELECT
                set_number,
                player1_score,
                player2_score
             FROM match_sets
             WHERE match_id = $1
             ORDER BY set_number ASC`,
            [matchId]
        );

        // Get player's rating change for this match
        const ratingResult = await pool.query(
            `SELECT
                old_rating,
                new_rating,
                rating_change
             FROM rating_history
             WHERE
                match_id = $1
                AND player_id = $2`,
            [matchId, playerId]
        );

        const isPlayer1 =
            Number(match.player1_id) ===
            Number(playerId);

        const isCompleted =
            match.status === "COMPLETED";

        let result = null;

        if (isCompleted) {
            result =
                Number(match.winner_id) ===
                Number(playerId)
                    ? "WIN"
                    : "LOSS";
        }

        const sets = setsResult.rows.map(set => ({
            set: Number(set.set_number),

            playerScore: isPlayer1
                ? Number(set.player1_score)
                : Number(set.player2_score),

            opponentScore: isPlayer1
                ? Number(set.player2_score)
                : Number(set.player1_score),

            won: isPlayer1
                ? Number(set.player1_score) >
                  Number(set.player2_score)
                : Number(set.player2_score) >
                  Number(set.player1_score)
        }));

        const rating =
            ratingResult.rows.length > 0
                ? {
                    oldRating: Number(
                        ratingResult.rows[0].old_rating
                    ),

                    newRating: Number(
                        ratingResult.rows[0].new_rating
                    ),

                    change: Number(
                        ratingResult.rows[0].rating_change
                    )
                }
                : null;

        res.status(200).json({
            success: true,

            match: {
                id: match.id,

                status: match.status,

                court: match.court,

                scheduledAt: match.scheduled_at,

                startedAt: match.started_at,

                completedAt: match.completed_at,

                result,

                cancellationReason:
                    match.cancellation_reason,

                player: {
                    id: playerId,
                    name: isPlayer1
                        ? match.player1_name
                        : match.player2_name
                },

                opponent: {
                    id: isPlayer1
                        ? match.player2_id
                        : match.player1_id,

                    name: isPlayer1
                        ? match.player2_name
                        : match.player1_name,

                    rating: isPlayer1
                        ? Number(match.player2_rating)
                        : Number(match.player1_rating)
                },

                referee: match.referee_id
                    ? {
                        id: match.referee_id,
                        name: match.referee_name
                    }
                    : null,

                sets,

                rating
            }
        });

    } catch (error) {

        console.error(
            "Get player match details error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to get match details"
        });
    }
};

const getMyRatingHistory = async (req, res) => {
    try {
        const playerId = req.user.id;

        const result = await pool.query(
            `SELECT
                rh.id,
                rh.match_id,
                rh.old_rating,
                rh.new_rating,
                rh.rating_change,
                rh.created_at,

                p1.id AS player1_id,
                p1.name AS player1_name,

                p2.id AS player2_id,
                p2.name AS player2_name

             FROM rating_history rh

             JOIN matches m
                ON rh.match_id = m.id

             JOIN players p1
                ON m.player1_id = p1.id

             JOIN players p2
                ON m.player2_id = p2.id

             WHERE rh.player_id = $1

             ORDER BY rh.created_at ASC`,
            [playerId]
        );

        const history = result.rows.map(item => {

            const isPlayer1 =
                Number(item.player1_id) ===
                Number(playerId);

            return {
                id: item.id,
                matchId: item.match_id,

                opponent: {
                    id: isPlayer1
                        ? item.player2_id
                        : item.player1_id,

                    name: isPlayer1
                        ? item.player2_name
                        : item.player1_name
                },

                oldRating: Number(item.old_rating),

                newRating: Number(item.new_rating),

                change: Number(item.rating_change),

                date: item.created_at
            };
        });

        res.status(200).json({
            success: true,
            count: history.length,
            history
        });

    } catch (error) {

        console.error(
            "Get rating history error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to get rating history"
        });
    }
};

module.exports = {
    getMyDashboard,
    getPlayerById,
    getMyProfile,
    getMyMatches,
    getMyMatchDetails,
    getMyUpcomingMatches,
    getMyRatingHistory
};