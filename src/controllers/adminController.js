const pool = require("../config/database");

const {
    comparePassword,
    hashPassword
} = require("../utils/password");

const {
    cancelExpiredMatches
} = require("../utils/matchStatus");

const getAdminDashboard = async (req, res) => {
    try {

        // Cancel matches that are more than 15 minutes late
        await cancelExpiredMatches();

        // --------------------------------------------
        // Player statistics
        // --------------------------------------------

        const playerStatsResult = await pool.query(
            `SELECT
                COUNT(*) AS total_players,

                COUNT(*) FILTER (
                    WHERE approval_status = 'PENDING'
                ) AS pending_players,

                COUNT(*) FILTER (
                    WHERE approval_status = 'APPROVED'
                ) AS approved_players,

                COUNT(*) FILTER (
                    WHERE approval_status = 'REJECTED'
                ) AS rejected_players

             FROM players`
        );

        // --------------------------------------------
        // Referee statistics
        // --------------------------------------------

        const refereeStatsResult = await pool.query(
            `SELECT
                COUNT(*) AS total_referees,

                COUNT(*) FILTER (
                    WHERE is_active = TRUE
                ) AS active_referees

             FROM referees`
        );

        // --------------------------------------------
        // Match statistics
        // --------------------------------------------

        const matchStatsResult = await pool.query(
            `SELECT
                COUNT(*) FILTER (
                    WHERE status = 'SCHEDULED'
                ) AS scheduled_matches,

                COUNT(*) FILTER (
                    WHERE status = 'LIVE'
                ) AS live_matches,

                COUNT(*) FILTER (
                    WHERE status = 'COMPLETED'
                ) AS completed_matches,

                COUNT(*) FILTER (
                    WHERE status = 'CANCELLED'
                ) AS cancelled_matches

             FROM matches`
        );

        const playerStats =
            playerStatsResult.rows[0];

        const refereeStats =
            refereeStatsResult.rows[0];

        const matchStats =
            matchStatsResult.rows[0];

        // --------------------------------------------
        // Upcoming matches
        // --------------------------------------------

        const upcomingResult = await pool.query(
            `SELECT
                m.id,
                m.court,
                m.scheduled_at,
                m.status,

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

             WHERE m.status = 'SCHEDULED'

             AND m.scheduled_at > CURRENT_TIMESTAMP

             ORDER BY m.scheduled_at ASC

             LIMIT 10`
        );

        const upcomingMatches =
            upcomingResult.rows.map(match => ({
                id: match.id,

                court: match.court,

                scheduledAt:
                    match.scheduled_at,

                status: match.status,

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
                    : null
            }));

        // --------------------------------------------
        // Live matches
        // --------------------------------------------

        const liveResult = await pool.query(
            `SELECT
                m.id,
                m.court,
                m.started_at,
                m.current_set,
                m.current_player1_score,
                m.current_player2_score,

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

             WHERE m.status = 'LIVE'

             ORDER BY m.started_at ASC`
        );

        const liveMatches =
            liveResult.rows.map(match => ({
                id: match.id,

                court: match.court,

                startedAt:
                    match.started_at,

                currentSet:
                    Number(match.current_set),

                score: {
                    player1:
                        Number(
                            match.current_player1_score
                        ),

                    player2:
                        Number(
                            match.current_player2_score
                        )
                },

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
                    : null
            }));

        // --------------------------------------------
        // Recent completed matches
        // --------------------------------------------

        const recentResult = await pool.query(
            `SELECT
                m.id,
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

             WHERE m.status = 'COMPLETED'

             ORDER BY m.completed_at DESC

             LIMIT 10`
        );

        const recentMatches =
            recentResult.rows.map(match => ({
                id: match.id,

                completedAt:
                    match.completed_at,

                winnerId:
                    match.winner_id,

                player1: {
                    id: match.player1_id,
                    name: match.player1_name
                },

                player2: {
                    id: match.player2_id,
                    name: match.player2_name
                }
            }));

        // --------------------------------------------
        // Response
        // --------------------------------------------

        res.status(200).json({
            success: true,

            stats: {
                players: {
                    total:
                        Number(
                            playerStats.total_players
                        ),

                    pending:
                        Number(
                            playerStats.pending_players
                        ),

                    approved:
                        Number(
                            playerStats.approved_players
                        ),

                    rejected:
                        Number(
                            playerStats.rejected_players
                        )
                },

                referees: {
                    total:
                        Number(
                            refereeStats.total_referees
                        ),

                    active:
                        Number(
                            refereeStats.active_referees
                        )
                },

                matches: {
                    scheduled:
                        Number(
                            matchStats.scheduled_matches
                        ),

                    live:
                        Number(
                            matchStats.live_matches
                        ),

                    completed:
                        Number(
                            matchStats.completed_matches
                        ),

                    cancelled:
                        Number(
                            matchStats.cancelled_matches
                        )
                }
            },

            upcomingMatches,

            liveMatches,

            recentMatches
        });

    } catch (error) {

        console.error(
            "Admin dashboard error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to load admin dashboard"
        });
    }
};

const createMatch = async (req, res) => {
    try {

        const adminId = req.user.id;

        const {
            player1Id,
            player2Id,
            refereeId,
            court,
            scheduledAt
        } = req.body;

        if (!player1Id || !player2Id || !scheduledAt) {
            return res.status(400).json({
                success: false,
                message: "player1Id, player2Id and scheduledAt are required"
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
             WHERE id IN ($1, $2)
             AND approval_status = 'APPROVED'`,
            [player1Id, player2Id]
        );

        if (playersResult.rows.length !== 2) {
            return res.status(404).json({
                success: false,
                message: "One or both players not found"
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

        // Check referee
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
                created_by_admin_id
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
                created_by_admin_id,
                created_at`,
            [
                player1Id,
                player2Id,
                refereeId || null,
                court || null,
                scheduledAt,
                adminId
            ]
        );

        res.status(201).json({
            success: true,
            message: "Match scheduled successfully",
            match: result.rows[0]
        });

    } catch (error) {
        console.error("Create admin match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create match"
        });
    }
};


const getAllMatches = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                m.id,
                m.status,
                m.court,
                m.scheduled_at,
                m.started_at,
                m.completed_at,
                m.winner_id,

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

             ORDER BY m.scheduled_at DESC`
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            matches: result.rows
        });

    } catch (error) {
        console.error("Get all matches error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get matches"
        });
    }
};


const updateMatch = async (req, res) => {
    try {
        const { matchId } = req.params;
        const { refereeId, court, scheduledAt } = req.body;

        const fieldsToUpdate = {};
        const queryParams = [];
        let paramIndex = 1;

        if (refereeId !== undefined) {
            fieldsToUpdate.referee_id = refereeId;
        }
        if (court !== undefined) {
            fieldsToUpdate.court = court;
        }
        if (scheduledAt !== undefined) {
            fieldsToUpdate.scheduled_at = scheduledAt;
        }

        if (Object.keys(fieldsToUpdate).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields to update"
            });
        }

        const setClauses = Object.keys(fieldsToUpdate).map((key) => {
            queryParams.push(fieldsToUpdate[key]);
            return `${key} = $${paramIndex++}`;
        });

        queryParams.push(matchId);

        const result = await pool.query(
            `UPDATE matches
             SET ${setClauses.join(", ")}
             WHERE id = $${paramIndex}
             AND status = 'SCHEDULED'
             RETURNING
                id,
                player1_id,
                player2_id,
                referee_id,
                court,
                scheduled_at,
                status`,
            queryParams
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Match cannot be updated"
            });
        }

        res.status(200).json({
            success: true,
            message: "Match updated successfully",
            match: result.rows[0]
        });

    } catch (error) {
        console.error("Update admin match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update match"
        });
    }
};

const getAllReferees = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                name,
                experience,
                is_active,
                created_at
             FROM referees
             ORDER BY created_at DESC`
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            referees: result.rows
        });

    } catch (error) {
        console.error("Get all referees error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get referees"
        });
    }
};

const getMatchDetails = async (req, res) => {
    try {
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

             WHERE m.id = $1`,
            [matchId]
        );

        if (matchResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Match not found"
            });
        }

        const setsResult = await pool.query(
            `SELECT
                set_number,
                player1_score,
                player2_score
             FROM match_sets
             WHERE match_id = $1
             ORDER BY set_number`,
            [matchId]
        );

        res.status(200).json({
            success: true,
            match: matchResult.rows[0],
            sets: setsResult.rows
        });

    } catch (error) {
        console.error("Get match details error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get match details"
        });
    }
};

const cancelMatch = async (req, res) => {
    try {
        const { matchId } = req.params;

        const result = await pool.query(
            `UPDATE matches
             SET 
                status = 'CANCELLED',
                cancellation_reason = 'ADMIN_CANCELLED'
             WHERE id = $1
             AND status = 'SCHEDULED'
             RETURNING
                id,
                player1_id,
                player2_id,
                referee_id,
                court,
                scheduled_at,
                status`,
            [matchId]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Only scheduled matches can be cancelled"
            });
        }

        res.status(200).json({
            success: true,
            message: "Match cancelled successfully",
            match: result.rows[0]
        });

    } catch (error) {
        console.error("Cancel match error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to cancel match"
        });
    }
};


const { getPhotoSignedUrl } = require("../config/supabase");

const getPendingPlayers = async (req, res) => {
    try {

        const result = await pool.query(
            `SELECT
                id,
                name,
                email,
                phone,
                gender,
                photo_url,
                approval_status,
                created_at
             FROM players
             WHERE approval_status = 'PENDING'
             ORDER BY created_at ASC`
        );

        const players = await Promise.all(
            result.rows.map(async p => ({
                id: p.id,
                name: p.name,
                email: p.email,
                phone: p.phone,
                gender: p.gender || null,
                photoUrl: await getPhotoSignedUrl(p.photo_url),
                approvalStatus: p.approval_status,
                createdAt: p.created_at
            }))
        );

        res.status(200).json({
            success: true,
            count: players.length,
            players
        });

    } catch (error) {

        console.error(
            "Get pending players error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to get pending players"
        });
    }
};

const approvePlayer = async (req, res) => {
    try {

        const { playerId } = req.params;

        const result = await pool.query(
            `UPDATE players
             SET approval_status = 'APPROVED'
             WHERE id = $1
             AND approval_status = 'PENDING'
             RETURNING
                id,
                name,
                email,
                phone,
                gender,
                photo_url,
                approval_status`,
            [playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Pending player not found"
            });
        }

        const player = result.rows[0];
        const photoUrl = await getPhotoSignedUrl(player.photo_url);

        res.status(200).json({
            success: true,
            message: "Player approved successfully",
            player: {
                id: player.id,
                name: player.name,
                email: player.email,
                phone: player.phone,
                gender: player.gender || null,
                photoUrl,
                approvalStatus: player.approval_status
            }
        });

    } catch (error) {

        console.error(
            "Approve player error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to approve player"
        });
    }
};

const rejectPlayer = async (req, res) => {
    try {

        const { playerId } = req.params;

        const result = await pool.query(
            `UPDATE players
             SET approval_status = 'REJECTED'
             WHERE id = $1
             AND approval_status = 'PENDING'
             RETURNING
                id,
                name,
                email,
                phone,
                gender,
                photo_url,
                approval_status`,
            [playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Pending player not found"
            });
        }

        const player = result.rows[0];
        const photoUrl = await getPhotoSignedUrl(player.photo_url);

        res.status(200).json({
            success: true,
            message: "Player rejected",
            player: {
                id: player.id,
                name: player.name,
                email: player.email,
                phone: player.phone,
                gender: player.gender || null,
                photoUrl,
                approvalStatus: player.approval_status
            }
        });

    } catch (error) {

        console.error(
            "Reject player error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to reject player"
        });
    }
};

const getAllPlayers = async (req, res) => {
    try {
        const { status } = req.query;

        let query = `
            SELECT
                id,
                name,
                email,
                phone,
                rating,
                wins,
                losses,
                gender,
                photo_url,
                approval_status,
                is_active,
                created_at
            FROM players
        `;

        const queryParams = [];

        if (status) {
            query += ` WHERE approval_status = $1`;
            queryParams.push(status.toUpperCase());
        }

        query += ` ORDER BY created_at DESC`;

        const result = await pool.query(query, queryParams);

        const players = await Promise.all(
            result.rows.map(async p => ({
                id: p.id,
                name: p.name,
                email: p.email,
                phone: p.phone,
                gender: p.gender || null,
                photoUrl: await getPhotoSignedUrl(p.photo_url),
                rating: Number(p.rating),
                wins: Number(p.wins),
                losses: Number(p.losses),
                approvalStatus: p.approval_status,
                isActive: p.is_active,
                createdAt: p.created_at
            }))
        );

        res.status(200).json({
            success: true,
            count: players.length,
            players
        });

    } catch (error) {
        console.error("Get all players admin error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get players"
        });
    }
};

const createReferee = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "name, email and password are required"
            });
        }

        // Check if email already exists
        const existingReferee = await pool.query(
            `SELECT id
             FROM referees
             WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        if (existingReferee.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered"
            });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        const result = await pool.query(
            `INSERT INTO referees
            (
                name,
                email,
                phone,
                password_hash,
                is_active
            )
            VALUES ($1, $2, $3, $4, TRUE)
            RETURNING
                id,
                name,
                email,
                phone,
                is_active,
                created_at`,
            [
                name.trim(),
                email.trim(),
                phone ? phone.trim() : null,
                passwordHash
            ]
        );

        res.status(201).json({
            success: true,
            message: "Referee created successfully",
            referee: result.rows[0]
        });

    } catch (error) {
        console.error(
            "Create referee error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to create referee"
        });
    }
};

module.exports = {
    getAdminDashboard,
    createMatch,
    getAllMatches,
    getMatchDetails,
    updateMatch,
    cancelMatch,
    getAllPlayers,
    getPendingPlayers,
    approvePlayer,
    rejectPlayer,
    getAllReferees,
    createReferee
};