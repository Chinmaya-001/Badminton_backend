const pool = require("../config/database");

const cancelExpiredMatches = async () => {
    try {

        const singlesResult = await pool.query(
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

        const doublesResult = await pool.query(
            `UPDATE doubles_matches
             SET status = 'CANCELLED'
             WHERE
                status = 'SCHEDULED'
                AND scheduled_at <
                    CURRENT_TIMESTAMP - INTERVAL '15 minutes'
             RETURNING id`
        );

        const cancelledCount =
            singlesResult.rows.length + doublesResult.rows.length;

        if (cancelledCount > 0) {
            console.log(
                `Automatically cancelled ${cancelledCount} expired match(es)`
            );
        }

        return [...singlesResult.rows, ...doublesResult.rows];

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