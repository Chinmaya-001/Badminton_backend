const express = require("express");

const {
    createDoublesMatch,
    getDoublesMatchById,
    getAllDoublesMatches,
    getPlayerDoublesMatches,
    submitDoublesMatchResult,
    cancelDoublesMatch,
    startDoublesMatch,
    updateDoublesScore,
    getMyDoublesMatches,
    getLiveDoublesMatches,
    getUpcomingDoublesMatches,
    getCompletedDoublesMatches
} = require("../controllers/doublesMatchController");

const {
    authenticate,
    requireAdmin,
    requireReferee
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticate);

// ================================================
// ADMIN ROUTES
// ================================================
router.post("/", requireAdmin, createDoublesMatch);
router.get("/", requireAdmin, getAllDoublesMatches);
router.patch("/:matchId/cancel", requireAdmin, cancelDoublesMatch);

// ================================================
// LIVE, UPCOMING & COMPLETED MATCH ROUTES
// (Must be defined before parameterized /:id route)
// ================================================
router.get("/live", getLiveDoublesMatches);
router.get("/upcoming", getUpcomingDoublesMatches);
router.get("/completed", getCompletedDoublesMatches);

// ================================================
// REFEREE ROUTES
// ================================================
router.get("/referee/matches", requireReferee, getMyDoublesMatches);
router.post("/referee/:matchId/start", requireReferee, startDoublesMatch);
router.post("/referee/:matchId/score", requireReferee, updateDoublesScore);

// ================================================
// PLAYER / GENERAL MATCH ROUTES
// ================================================
router.get("/player/:playerId", getPlayerDoublesMatches);
router.post("/:matchId/result", submitDoublesMatchResult);
router.get("/:id", getDoublesMatchById);

module.exports = router;
