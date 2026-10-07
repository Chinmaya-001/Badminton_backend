const K_FACTOR = 32;

const calculateExpectedScore = (ratingA, ratingB) => {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
};

const calculateNewRating = (rating, opponentRating, actualScore) => {
    const expectedScore = calculateExpectedScore(
        rating,
        opponentRating
    );

    return Math.round(
        rating + K_FACTOR * (actualScore - expectedScore)
    );
};

const calculateRatingChange = (
    rating,
    opponentRating,
    actualScore
) => {
    const newRating = calculateNewRating(
        rating,
        opponentRating,
        actualScore
    );

    return newRating - rating;
};

module.exports = {
    calculateNewRating,
    calculateRatingChange
};