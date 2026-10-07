const express = require("express");

const {
    getMyDashboard,
    getPlayerById,
    getMyProfile,
    getMyMatches,
    getMyMatchDetails,
    getMyUpcomingMatches,
    getMyRatingHistory
} = require("../controllers/playerController");

const {
    getPlayerRanking
} = require("../controllers/rankingController");

const {
    authenticate, 
    requirePlayer   
} = require("../middleware/authMiddleware");

const {
    updateProfile,
    updatePassword
} = require("../controllers/accountController");

const {
    handlePhotoUpload
} = require("../middleware/uploadMiddleware");

const router = express.Router();

router.use(authenticate);
router.use(requirePlayer)

router.patch(
    "/me/profile",
    handlePhotoUpload,
    updateProfile
);

router.patch(
    "/me/password",
    updatePassword
);

router.get("/me", getMyProfile);
router.get("/me/dashboard", getMyDashboard);
router.get("/me/matches", getMyMatches);
router.get("/me/upcoming-matches", getMyUpcomingMatches);
router.get("/me/matches/:matchId", getMyMatchDetails);
router.get("/me/rating-history", getMyRatingHistory);
router.get("/:id", getPlayerById);
router.get("/:id/rank", getPlayerRanking);

module.exports = router;