const pool = require("../config/database");
const { getPhotoSignedUrl } = require("../config/supabase");

const getLeaderboard = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                name,
                gender,
                photo_url,
                rating,
                wins,
                losses,
                (wins + losses) AS matches_played,
                CASE
                    WHEN (wins + losses) = 0 THEN 0
                    ELSE ROUND((wins::numeric / (wins + losses)) * 100, 2)
                END AS win_percentage,
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
             ORDER BY rank ASC`
        );

        const rankings = await Promise.all(
            result.rows.map(
                async (player) => ({
                    rank: Number(player.rank),
                    id: player.id,
                    name: player.name,
                    gender: player.gender || null,
                    photoUrl: await getPhotoSignedUrl(player.photo_url),
                    rating: Number(player.rating),
                    wins: Number(player.wins),
                    losses: Number(player.losses),
                    matchesPlayed: Number(player.matches_played),
                    winPercentage: Number(player.win_percentage)
                })
            )
        );

        res.status(200).json({
            success: true,
            count: rankings.length,
            rankings
        });

    } catch (error) {
        console.error("Get leaderboard error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get leaderboard"
        });
    }
};

const getPlayerRanking = async (req, res) => {
    try {
        const { playerId } = req.params;

        const result = await pool.query(
            `WITH ranked_players AS (
                SELECT
                    id,
                    name,
                    gender,
                    photo_url,
                    rating,
                    wins,
                    losses,
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
            SELECT * FROM ranked_players WHERE id = $1`,
            [playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Player not found or not approved"
            });
        }

        const player = result.rows[0];

        const matchesPlayed = Number(player.wins) + Number(player.losses);

        const winPercentage =
            matchesPlayed === 0
                ? 0
                : Number(((Number(player.wins) / matchesPlayed) * 100).toFixed(2));

        const photoUrl = await getPhotoSignedUrl(player.photo_url);

        res.status(200).json({
            success: true,
            player: {
                id: player.id,
                name: player.name,
                gender: player.gender || null,
                photoUrl,
                rank: Number(player.rank),
                rating: Number(player.rating),
                wins: Number(player.wins),
                losses: Number(player.losses),
                matchesPlayed,
                winPercentage
            }
        });

    } catch (error) {
        console.error("Get player ranking error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get player ranking"
        });
    }
};

module.exports = {
    getLeaderboard,
    getPlayerRanking
};