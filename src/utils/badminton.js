const validateSetScore = (player1Score, player2Score) => {
    if (
        !Number.isInteger(player1Score) ||
        !Number.isInteger(player2Score)
    ) {
        return {
            valid: false,
            message: "Scores must be integers"
        };
    }

    if (player1Score < 0 || player2Score < 0) {
        return {
            valid: false,
            message: "Scores cannot be negative"
        };
    }

    // Maximum possible score is 30
    if (player1Score > 30 || player2Score > 30) {
        return {
            valid: false,
            message: "A set cannot exceed 30 points"
        };
    }

    // A set cannot end in a tie
    if (player1Score === player2Score) {
        return {
            valid: false,
            message: "A set cannot end in a tie"
        };
    }

    const winnerScore = Math.max(player1Score, player2Score);
    const loserScore = Math.min(player1Score, player2Score);

    /*
     * Normal situation:
     *
     * 21-0
     * 21-18
     * 21-19
     *
     * are valid.
     */
    if (winnerScore === 21 && loserScore < 20) {
        return {
            valid: true
        };
    }

    /*
     * Once the score reaches 20-20,
     * a player needs a 2-point advantage.
     *
     * 22-20 ✅
     * 23-21 ✅
     * 24-22 ✅
     */
    if (winnerScore >= 22 && winnerScore < 30) {
        if (winnerScore - loserScore === 2) {
            return {
                valid: true
            };
        }

        return {
            valid: false,
            message: "After 20-20, a player must win by 2 points"
        };
    }

    /*
     * 30-29 is the maximum possible game,
     * because 30 wins automatically.
     *
     * 30-29 ✅
     */
    if (winnerScore === 30 && loserScore <= 29) {
        return {
            valid: true
        };
    }

    return {
        valid: false,
        message: "Invalid badminton score"
    };
};

module.exports = {
    validateSetScore
};