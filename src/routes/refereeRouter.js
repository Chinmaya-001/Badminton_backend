const express = require("express");

const {
    startMatch,
    updateScore,
    getMyMatches
} = require("../controllers/refereeController");

const {
    authenticate,
    requireReferee
} = require("../middleware/authMiddleware");

const {
    updateProfile,
    updatePassword
} = require("../controllers/accountController");

const router = express.Router();

router.use(authenticate);
router.use(requireReferee);

router.patch(
    "/me/profile",
    updateProfile
);

router.patch(
    "/me/password",
    updatePassword
);

router.get("/matches", getMyMatches);

router.post("/matches/:matchId/start", startMatch);

router.post("/matches/:matchId/score", updateScore);

module.exports = router;