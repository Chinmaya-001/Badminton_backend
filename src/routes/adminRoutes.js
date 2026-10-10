const express = require("express");

const {
    getAdminDashboard,
    createMatch,
    getAllMatches,
    getMatchDetails,
    cancelMatch,
    updateMatch,
    getAllReferees,
    getAllPlayers,
    getPlayerByName,
    getPendingPlayers,
    approvePlayer,
    rejectPlayer,
    getRejectedPlayers,
    approveRejectedPlayer,
    createReferee
} = require("../controllers/adminController");

const {
    updateProfile,
    updatePassword
} = require("../controllers/accountController");

const {
    authenticate,
    requireAdmin
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.get("/dashboard", getAdminDashboard);

router.post("/matches", createMatch);

router.get("/matches", getAllMatches);

router.get("/matches/:matchId", getMatchDetails);

router.patch("/matches/:matchId",updateMatch);

router.patch(
    "/matches/:matchId/cancel",
    cancelMatch
);
router.patch(
    "/me/profile",
    updateProfile
);

router.patch(
    "/me/password",
    updatePassword
);

router.get("/players/all", getAllPlayers);

router.get("/players/search", getPlayerByName);

router.get("/players/pending",getPendingPlayers);

router.patch(
    "/players/:playerId/approve",
    approvePlayer
);

router.patch(
    "/players/:playerId/reject",
    rejectPlayer
);

router.get("/players/rejected", getRejectedPlayers);

router.patch(
    "/players/:playerId/approve-rejected",
    approveRejectedPlayer
);

router.get("/referees",getAllReferees);

router.post("/referee/add",createReferee);


module.exports = router;