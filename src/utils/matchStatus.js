const pool = require("../config/database");

const cancelExpiredMatches = async () => {
    try {

        const result = await pool.query(
            `UPDATE matches
             SET
                status = 'CANCELLED',
                cancellation_reason = 'TIME_EXPIRED'
             WHERE
                status = 'SCHEDULED'
                AND scheduled_at <
                    CURRENT_TIMESTAMP - INTERVAL '15 minutes'
             RETURNING id`
        );

        if (result.rows.length > 0) {
            console.log(
                `Automatically cancelled ${result.rows.length} expired match(es)`
            );
        }

        return result.rows;

    } catch (error) {

        console.error(
            "Cancel expired matches error:",
            error
        );

        throw error;
    }
};

module.exports = {
    cancelExpiredMatches
};